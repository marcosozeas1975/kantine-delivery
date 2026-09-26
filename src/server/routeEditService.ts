/**
 * M4.4 — Edição Controlada, Versionamento e Reenvio de Rotas
 * 
 * Regras Operacionais:
 * - Versionamento estrito: route_version 1 -> 2 -> 3...
 * - Concorrência otimista: UPDATE ... WHERE id = ? AND route_version = expected_version
 * - Classificação automática: CORREÇÃO OPERACIONAL vs ALTERAÇÃO MATERIAL
 * - DRAFT: edição livre sem Telegram
 * - OFFERED: incrementa versão, invalida oferta anterior, reenvia para motoristas elegíveis
 * - ACCEPTED (Operacional): aplica, notifica motorista com Maps atualizado e botão [✅ CIENTE]
 * - ACCEPTED (Material): NÃO aplica silenciosamente. Fica em CHANGE_PENDING_DRIVER_APPROVAL até aceite/recusa do motorista
 * - Paradas concluídas (DELIVERED): Imutáveis
 * - Rotas COMPLETED / CANCELLED: Bloqueadas para edição
 */

import { db } from '../db/index.ts';
import {
  routes,
  routeStops,
  routeEvents,
  routeUpdates,
  routeOfferDispatches,
  pickupLocations,
} from '../db/schema.ts';
import { eq, and, sql, asc } from 'drizzle-orm';
import {
  Route,
  RouteStop,
  EditRouteDTO,
  RouteEditAnalysis,
  RouteChangeType,
  RouteUpdateRecord,
} from './types.ts';
import { routeService } from './routeService.ts';
import { telegramBot } from './telegramBot.ts';
import { driverService } from './driverService.ts';
import { deliveryConfigService } from './deliveryConfigService.ts';
import { generateRouteNavigationLinks } from './mapsNavigation.ts';

export class RouteEditService {
  /**
   * Classifica a alteração proposta entre OPERACIONAL e MATERIAL,
   * gerando diff estruturado e resumo legível para confirmação administrativa.
   */
  public classifyRouteEdit(
    existingRoute: Route,
    editData: EditRouteDTO
  ): RouteEditAnalysis {
    const status = existingRoute.status;
    const diff_items: RouteEditAnalysis['diff_items'] = [];
    const changed_fields: string[] = [];
    let is_material = false;

    // 1. Verificar alteração no ponto de coleta (Material)
    if (
      editData.pickup_address &&
      editData.pickup_address.trim() !== existingRoute.pickup_address.trim()
    ) {
      is_material = true;
      changed_fields.push('pickup_address');
      diff_items.push({
        field: 'pickup_address',
        label: 'Endereço de Coleta',
        old_value: existingRoute.pickup_address,
        new_value: editData.pickup_address.trim(),
      });
    }

    if (
      editData.pickup_location_id !== undefined &&
      editData.pickup_location_id !== existingRoute.pickup_location_id
    ) {
      is_material = true;
      changed_fields.push('pickup_location_id');
      diff_items.push({
        field: 'pickup_location_id',
        label: 'Ponto de Coleta Cadastrado',
        old_value: existingRoute.pickup_location_id,
        new_value: editData.pickup_location_id,
      });
    }

    // 2. Verificar alteração no frete final do motorista (Sempre Material pós-aceite — Seção 16)
    if (editData.final_driver_fee !== undefined && editData.final_driver_fee !== null) {
      const parsedNewFee = parseFloat(String(editData.final_driver_fee).replace(',', '.'));
      const oldFee = existingRoute.final_driver_fee ?? parseFloat(existingRoute.total_fee.replace(',', '.'));
      if (!isNaN(parsedNewFee) && Math.abs(parsedNewFee - oldFee) > 0.009) {
        is_material = true;
        changed_fields.push('final_driver_fee');
        diff_items.push({
          field: 'final_driver_fee',
          label: 'Frete Pago ao Motorista',
          old_value: `R$ ${oldFee.toFixed(2).replace('.', ',')}`,
          new_value: `R$ ${parsedNewFee.toFixed(2).replace('.', ',')}`,
        });
      }
    }

    // 3. Verificar prazo final da rota (Operacional — Seção 6)
    if (
      editData.final_deadline &&
      editData.final_deadline.trim() !== existingRoute.final_deadline.trim()
    ) {
      changed_fields.push('final_deadline');
      diff_items.push({
        field: 'final_deadline',
        label: 'Prazo Final da Rota',
        old_value: existingRoute.final_deadline,
        new_value: editData.final_deadline.trim(),
      });
    }

    // 4. Analisar Paradas (Stops)
    if (editData.stops) {
      const existingStops = existingRoute.stops || [];

      // Validar imutabilidade de paradas já concluídas (Seção 19 & 20)
      for (const oldStop of existingStops) {
        if (oldStop.status === 'DELIVERED') {
          // Procurar parada no editData
          const edited = editData.stops.find((s) => s.id === oldStop.id);
          if (edited) {
            if (
              edited.destination_address.trim() !== oldStop.destination_address.trim() ||
              edited.destination_neighborhood.trim() !== oldStop.destination_neighborhood.trim() ||
              edited.cargo_description.trim() !== oldStop.cargo_description.trim()
            ) {
              throw new Error(
                'CANNOT_EDIT_COMPLETED_STOP: Não é permitido alterar dados de paradas já concluídas.'
              );
            }
          }
        }
      }

      // Adicionar parada (Material — Seção 7)
      if (editData.stops.length > existingStops.length) {
        is_material = true;
        changed_fields.push('stops_added');
        const addedCount = editData.stops.length - existingStops.length;
        diff_items.push({
          field: 'stops_added',
          label: 'Paradas Adicionadas',
          old_value: `${existingStops.length} entregas`,
          new_value: `${editData.stops.length} entregas (+${addedCount})`,
        });
      }

      // Remover parada (Material — Seção 7)
      if (editData.stops.length < existingStops.length) {
        is_material = true;
        changed_fields.push('stops_removed');
        const removedCount = existingStops.length - editData.stops.length;
        diff_items.push({
          field: 'stops_removed',
          label: 'Paradas Removidas',
          old_value: `${existingStops.length} entregas`,
          new_value: `${editData.stops.length} entregas (-${removedCount})`,
        });
      }

      // Verificar alterações individuais em paradas pendentes (Operacional — Seção 6)
      for (let i = 0; i < editData.stops.length; i++) {
        const newStop = editData.stops[i];
        const oldStop = newStop.id
          ? existingStops.find((s) => s.id === newStop.id)
          : existingStops[i];

        if (oldStop) {
          if (newStop.destination_address && newStop.destination_address.trim() !== oldStop.destination_address.trim()) {
            changed_fields.push(`stop_${oldStop.sequence}_address`);
            diff_items.push({
              field: `stop_${oldStop.sequence}_address`,
              label: `Endereço Entrega #${oldStop.sequence}`,
              old_value: oldStop.destination_address,
              new_value: newStop.destination_address.trim(),
            });
          }

          if (
            newStop.destination_neighborhood &&
            newStop.destination_neighborhood.trim() !== oldStop.destination_neighborhood.trim()
          ) {
            changed_fields.push(`stop_${oldStop.sequence}_neighborhood`);
            diff_items.push({
              field: `stop_${oldStop.sequence}_neighborhood`,
              label: `Bairro Entrega #${oldStop.sequence}`,
              old_value: oldStop.destination_neighborhood,
              new_value: newStop.destination_neighborhood.trim(),
            });
          }

          if (
            newStop.desired_deadline !== undefined &&
            newStop.desired_deadline !== oldStop.desired_deadline
          ) {
            changed_fields.push(`stop_${oldStop.sequence}_deadline`);
            diff_items.push({
              field: `stop_${oldStop.sequence}_deadline`,
              label: `Prazo Desejável #${oldStop.sequence}`,
              old_value: oldStop.desired_deadline || 'Não informado',
              new_value: newStop.desired_deadline || 'Não informado',
            });
          }

          if (
            newStop.observations !== undefined &&
            newStop.observations !== oldStop.observations
          ) {
            changed_fields.push(`stop_${oldStop.sequence}_observations`);
            diff_items.push({
              field: `stop_${oldStop.sequence}_observations`,
              label: `Observações #${oldStop.sequence}`,
              old_value: oldStop.observations || 'Nenhuma',
              new_value: newStop.observations || 'Nenhuma',
            });
          }

          if (
            newStop.cargo_description &&
            newStop.cargo_description.trim() !== oldStop.cargo_description.trim()
          ) {
            changed_fields.push(`stop_${oldStop.sequence}_cargo`);
            diff_items.push({
              field: `stop_${oldStop.sequence}_cargo`,
              label: `Pedido/Carga #${oldStop.sequence}`,
              old_value: oldStop.cargo_description,
              new_value: newStop.cargo_description.trim(),
            });
          }
        }
      }
    }

    let change_type: RouteChangeType = is_material ? 'MATERIAL' : 'OPERATIONAL';
    if (status === 'DRAFT') {
      change_type = 'DRAFT_EDIT';
      is_material = false;
    } else if (status === 'OFFERED') {
      change_type = 'OFFERED_REOFFER';
      is_material = false;
    }

    // Construir resumo legível
    const summaryLines = diff_items.map((item) => {
      return `• ${item.label}:\n  ANTES: ${item.old_value}\n  DEPOIS: ${item.new_value}`;
    });
    const diff_summary = summaryLines.length > 0 ? summaryLines.join('\n\n') : 'Nenhuma alteração detectada';

    return {
      change_type,
      is_material,
      changed_fields,
      diff_summary,
      diff_items,
    };
  }

  /**
   * Executa a edição controlada com proteção de concorrência e aplicação conforme classificação.
   */
  public async executeRouteEdit(
    routeId: number,
    editData: EditRouteDTO,
    actor: string = 'ADMIN'
  ): Promise<{
    status: 'APPLIED' | 'PENDING_DRIVER_APPROVAL';
    route: Route;
    update_id?: number;
    diff_summary: string;
    change_type: RouteChangeType;
  }> {
    const existingRoute = await routeService.getRouteById(routeId);
    if (!existingRoute) {
      throw new Error('ROUTE_NOT_FOUND');
    }

    // Seção 21 & 22: Bloqueio de rotas encerradas ou canceladas
    if (existingRoute.status === 'COMPLETED') {
      throw new Error('CANNOT_EDIT_COMPLETED_ROUTE: Rotas concluídas não podem ser alteradas.');
    }
    if (existingRoute.status === 'CANCELLED') {
      throw new Error('CANNOT_EDIT_CANCELLED_ROUTE: Rotas canceladas não podem ser alteradas.');
    }

    // Seção 23: Proteção estrita contra edição concorrente perdida
    if (editData.expected_version !== existingRoute.route_version) {
      throw new Error(
        'CONCURRENT_MODIFICATION_CONFLICT: Esta rota foi alterada por outro processo. Recarregue os dados antes de continuar.'
      );
    }

    const analysis = this.classifyRouteEdit(existingRoute, editData);
    const oldVersion = existingRoute.route_version;
    const newVersion = oldVersion + 1;

    // =========================================================================
    // CASO 1: ALTERAÇÃO MATERIAL PÓS-ACEITE
    // Não aplica silenciosamente! Registra proposta pendente e notifica motorista.
    // =========================================================================
    if (analysis.is_material && ['ACCEPTED', 'ARRIVED_PICKUP', 'PICKED_UP', 'IN_TRANSIT'].includes(existingRoute.status)) {
      // Registrar snapshot anterior e proposta pendente
      const [updateRecord] = await db
        .insert(routeUpdates)
        .values({
          route_id: routeId,
          old_version: oldVersion,
          new_version: newVersion,
          change_type: 'MATERIAL',
          changed_fields: JSON.stringify(analysis.changed_fields),
          diff_summary: analysis.diff_summary,
          previous_snapshot: JSON.stringify(existingRoute),
          new_snapshot: null, // Pendente de aprovação
          pending_proposal: JSON.stringify(editData),
          actor,
          driver_approval_status: 'PENDING',
        })
        .returning();

      // Marcar rota com flag de alteração pendente
      await db
        .update(routes)
        .set({
          change_pending_driver_approval: true,
          pending_material_change: JSON.stringify({
            update_id: updateRecord.id,
            proposed_version: newVersion,
            diff_summary: analysis.diff_summary,
            actor,
          }),
        })
        .where(
          and(
            eq(routes.id, routeId),
            eq(routes.route_version, oldVersion)
          )
        );

      // Notificar motorista vencedor no Telegram com botões de Aceitar/Recusar (Seção 14)
      if (existingRoute.accepted_driver_id) {
        const driver = await driverService.getDriverById(existingRoute.accepted_driver_id);
        if (driver?.telegram_chat_id) {
          await telegramBot.sendRouteMaterialChangeProposal(
            driver.telegram_chat_id,
            existingRoute,
            updateRecord.id,
            analysis.diff_summary
          );
        }
      }

      const refreshedRoute = (await routeService.getRouteById(routeId))!;
      return {
        status: 'PENDING_DRIVER_APPROVAL',
        route: refreshedRoute,
        update_id: updateRecord.id,
        diff_summary: analysis.diff_summary,
        change_type: 'MATERIAL',
      };
    }

    // =========================================================================
    // CASO 2: DRAFT / OFFERED / CORREÇÃO OPERACIONAL PÓS-ACEITE
    // Aplica diretamente, incrementa versão com lock atômico.
    // =========================================================================

    // Montar objeto de atualização dos campos da rota
    const updateFields: any = {
      route_version: newVersion,
    };

    if (editData.final_deadline) {
      updateFields.final_deadline = editData.final_deadline.trim();
    }
    if (editData.total_fee) {
      updateFields.total_fee = editData.total_fee.trim();
    }
    if (editData.final_driver_fee !== undefined && editData.final_driver_fee !== null) {
      const parsedFee = parseFloat(String(editData.final_driver_fee).replace(',', '.'));
      if (!isNaN(parsedFee)) {
        updateFields.final_driver_fee = parsedFee.toFixed(2);
        updateFields.total_fee = parsedFee.toFixed(2).replace('.', ',');
      }
    }
    if (editData.override_reason !== undefined) {
      updateFields.override_reason = editData.override_reason?.trim() || null;
    }
    if (editData.pickup_name) {
      updateFields.pickup_name = editData.pickup_name.trim();
    }
    if (editData.pickup_address) {
      updateFields.pickup_address = editData.pickup_address.trim();
    }
    if (editData.pickup_neighborhood) {
      updateFields.pickup_neighborhood_snapshot = editData.pickup_neighborhood.trim();
    }
    if (editData.pickup_location_id !== undefined) {
      updateFields.pickup_location_id = editData.pickup_location_id;
    }
    if (editData.accepted_vehicle_types) {
      updateFields.accepted_vehicle_types = JSON.stringify(editData.accepted_vehicle_types);
    }

    // Executar UPDATE com trava otimista (Seção 23)
    const updateResult = await db
      .update(routes)
      .set(updateFields)
      .where(
        and(
          eq(routes.id, routeId),
          eq(routes.route_version, editData.expected_version)
        )
      )
      .returning();

    if (updateResult.length === 0) {
      throw new Error(
        'CONCURRENT_MODIFICATION_CONFLICT: Esta rota foi alterada por outro processo. Recarregue os dados antes de continuar.'
      );
    }

    // Atualizar paradas se fornecidas
    if (editData.stops && editData.stops.length > 0) {
      for (let i = 0; i < editData.stops.length; i++) {
        const s = editData.stops[i];
        if (s.id) {
          const stopUpdateData: any = {};
          if (s.destination_address) stopUpdateData.destination_address = s.destination_address.trim();
          if (s.destination_neighborhood) stopUpdateData.destination_neighborhood = s.destination_neighborhood.trim();
          if (s.cargo_description) stopUpdateData.cargo_description = s.cargo_description.trim();
          if (s.desired_deadline !== undefined) stopUpdateData.desired_deadline = s.desired_deadline?.trim() || null;
          if (s.observations !== undefined) stopUpdateData.observations = s.observations?.trim() || null;
          if (s.delivery_mode) stopUpdateData.delivery_mode = s.delivery_mode;
          if (s.sequence) stopUpdateData.sequence = s.sequence;

          await db
            .update(routeStops)
            .set(stopUpdateData)
            .where(eq(routeStops.id, s.id));
        }
      }
    }

    const updatedRoute = (await routeService.getRouteById(routeId))!;

    // Registrar histórico em route_updates (Seção 8 & 9)
    const [updateRecord] = await db
      .insert(routeUpdates)
      .values({
        route_id: routeId,
        old_version: oldVersion,
        new_version: newVersion,
        change_type: analysis.change_type,
        changed_fields: JSON.stringify(analysis.changed_fields),
        diff_summary: analysis.diff_summary,
        previous_snapshot: JSON.stringify(existingRoute),
        new_snapshot: JSON.stringify(updatedRoute),
        actor,
        driver_approval_status: 'NOT_REQUIRED',
      })
      .returning();

    // Registrar evento de auditoria
    await db.insert(routeEvents).values({
      route_id: routeId,
      event_type: 'ROUTE_UPDATED',
      actor,
      details: `Version ${oldVersion} -> ${newVersion} (${analysis.change_type}): ${analysis.diff_summary}`,
    });

    // =========================================================================
    // AÇÕES PÓS-EDIÇÃO CONFORME STATUS
    // =========================================================================

    // Seção 4: OFFERED — Invalidar ofertas antigas e reenviar para motoristas
    if (existingRoute.status === 'OFFERED') {
      // Invalidação das mensagens anteriores
      const dispatches = await db
        .select()
        .from(routeOfferDispatches)
        .where(
          and(
            eq(routeOfferDispatches.route_id, routeId),
            eq(routeOfferDispatches.status, 'SENT')
          )
        );

      for (const disp of dispatches) {
        if (disp.telegram_message_id) {
          await telegramBot
            .invalidateRouteOfferMarkup(disp.telegram_chat_id, disp.telegram_message_id)
            .catch(() => {});
        }
      }

      // Reenviar oferta atualizada para motoristas elegíveis (com nova versão)
      await routeService.publishRoute(routeId, actor, { isRepublish: true });
    }

    // Seção 6 & 11: ACCEPTED (Correção Operacional) — Avisar motorista vencedor
    if (['ACCEPTED', 'ARRIVED_PICKUP', 'PICKED_UP', 'IN_TRANSIT'].includes(existingRoute.status)) {
      if (existingRoute.accepted_driver_id) {
        const driver = await driverService.getDriverById(existingRoute.accepted_driver_id);
        if (driver?.telegram_chat_id) {
          await telegramBot.sendRouteOperationalUpdate(
            driver.telegram_chat_id,
            updatedRoute,
            oldVersion,
            newVersion,
            analysis.diff_summary
          );
        }
      }
    }

    return {
      status: 'APPLIED',
      route: updatedRoute,
      update_id: updateRecord.id,
      diff_summary: analysis.diff_summary,
      change_type: analysis.change_type,
    };
  }

  /**
   * Processa a decisão do motorista referente a uma alteração material proposta.
   */
  public async handleDriverMaterialDecision(
    routeId: number,
    updateId: number,
    driverId: number,
    decision: 'ACCEPT' | 'REJECT'
  ): Promise<{ status: 'ACCEPTED' | 'REJECTED'; route: Route }> {
    const route = await routeService.getRouteById(routeId);
    if (!route) throw new Error('ROUTE_NOT_FOUND');

    if (route.accepted_driver_id !== driverId) {
      throw new Error('UNAUTHORIZED_DRIVER: Apenas o motorista vencedor pode responder a esta alteração.');
    }

    const [updateRecord] = await db
      .select()
      .from(routeUpdates)
      .where(
        and(
          eq(routeUpdates.id, updateId),
          eq(routeUpdates.route_id, routeId)
        )
      );

    if (!updateRecord || updateRecord.driver_approval_status !== 'PENDING') {
      throw new Error('INVALID_OR_ALREADY_PROCESSED: Esta solicitação de alteração já foi processada.');
    }

    const driver = await driverService.getDriverById(driverId);

    if (decision === 'ACCEPT') {
      // Aplicar a proposta que estava pendente
      const proposal: EditRouteDTO = JSON.parse(updateRecord.pending_proposal || '{}');
      const newVersion = updateRecord.new_version;

      const updateFields: any = {
        route_version: newVersion,
        driver_acknowledged_version: newVersion,
        change_pending_driver_approval: false,
        pending_material_change: null,
      };

      if (proposal.final_driver_fee !== undefined && proposal.final_driver_fee !== null) {
        const parsedFee = parseFloat(String(proposal.final_driver_fee).replace(',', '.'));
        if (!isNaN(parsedFee)) {
          updateFields.final_driver_fee = parsedFee.toFixed(2);
          updateFields.total_fee = parsedFee.toFixed(2).replace('.', ',');
        }
      }
      if (proposal.final_deadline) updateFields.final_deadline = proposal.final_deadline.trim();
      if (proposal.pickup_name) updateFields.pickup_name = proposal.pickup_name.trim();
      if (proposal.pickup_address) updateFields.pickup_address = proposal.pickup_address.trim();
      if (proposal.pickup_neighborhood) updateFields.pickup_neighborhood_snapshot = proposal.pickup_neighborhood.trim();
      if (proposal.pickup_location_id !== undefined) updateFields.pickup_location_id = proposal.pickup_location_id;

      await db
        .update(routes)
        .set(updateFields)
        .where(eq(routes.id, routeId));

      // Se houver paradas adicionadas ou atualizadas na proposta
      if (proposal.stops && proposal.stops.length > 0) {
        // Obter paradas existentes
        const existingStops = route.stops || [];
        for (const s of proposal.stops) {
          if (s.id) {
            await db
              .update(routeStops)
              .set({
                destination_address: s.destination_address.trim(),
                destination_neighborhood: s.destination_neighborhood.trim(),
                cargo_description: s.cargo_description.trim(),
                desired_deadline: s.desired_deadline?.trim() || null,
                observations: s.observations?.trim() || null,
                delivery_mode: s.delivery_mode || 'IN_PERSON',
                sequence: s.sequence || 1,
              })
              .where(eq(routeStops.id, s.id));
          } else {
            // Nova parada adicionada
            const nextSeq = s.sequence || existingStops.length + 1;
            const pinCode = String(Math.floor(1000 + Math.random() * 9000));
            await db.insert(routeStops).values({
              route_id: routeId,
              sequence: nextSeq,
              destination_address: s.destination_address.trim(),
              destination_neighborhood: s.destination_neighborhood.trim(),
              cargo_description: s.cargo_description.trim(),
              delivery_mode: s.delivery_mode || 'IN_PERSON',
              desired_deadline: s.desired_deadline?.trim() || null,
              observations: s.observations?.trim() || null,
              pin_code: pinCode,
              status: 'PENDING',
              modality_code: s.modality_code || 'CONVENCIONAL',
            });
          }
        }
      }

      const refreshedRoute = (await routeService.getRouteById(routeId))!;

      // Atualizar registro de auditoria
      await db
        .update(routeUpdates)
        .set({
          driver_approval_status: 'ACCEPTED',
          driver_decision_at: sql`NOW()`,
          driver_acknowledged_at: sql`NOW()`,
          new_snapshot: JSON.stringify(refreshedRoute),
        })
        .where(eq(routeUpdates.id, updateId));

      // Registrar evento de auditoria
      await db.insert(routeEvents).values({
        route_id: routeId,
        event_type: 'ROUTE_CHANGE_ACCEPTED',
        actor: `DRIVER #${driverId}`,
        details: `Driver accepted material change to version ${newVersion}`,
      });

      // Notificar motorista no Telegram
      if (driver?.telegram_chat_id) {
        await telegramBot.sendRouteMaterialDecisionConfirmation(
          driver.telegram_chat_id,
          refreshedRoute,
          true
        );
      }

      return { status: 'ACCEPTED', route: refreshedRoute };
    } else {
      // REJEITAR: Descartar proposta, limpar pendência, rota permanece inalterada
      await db
        .update(routes)
        .set({
          change_pending_driver_approval: false,
          pending_material_change: null,
        })
        .where(eq(routes.id, routeId));

      await db
        .update(routeUpdates)
        .set({
          driver_approval_status: 'REJECTED',
          driver_decision_at: sql`NOW()`,
        })
        .where(eq(routeUpdates.id, updateId));

      await db.insert(routeEvents).values({
        route_id: routeId,
        event_type: 'ROUTE_CHANGE_REJECTED',
        actor: `DRIVER #${driverId}`,
        details: `Driver rejected material change proposal #${updateId}`,
      });

      if (driver?.telegram_chat_id) {
        await telegramBot.sendRouteMaterialDecisionConfirmation(
          driver.telegram_chat_id,
          route,
          false
        );
      }

      return { status: 'REJECTED', route };
    }
  }

  /**
   * Processa confirmação de ciência do motorista para correções operacionais.
   */
  public async handleDriverOperationalAck(
    routeId: number,
    version: number,
    driverId: number
  ): Promise<boolean> {
    const route = await routeService.getRouteById(routeId);
    if (!route) return false;

    if (route.accepted_driver_id !== driverId) {
      return false;
    }

    await db
      .update(routes)
      .set({
        driver_acknowledged_version: version,
      })
      .where(eq(routes.id, routeId));

    await db
      .update(routeUpdates)
      .set({
        driver_acknowledged_at: sql`NOW()`,
      })
      .where(
        and(
          eq(routeUpdates.route_id, routeId),
          eq(routeUpdates.new_version, version)
        )
      );

    await db.insert(routeEvents).values({
      route_id: routeId,
      event_type: 'ROUTE_CHANGE_ACKNOWLEDGED',
      actor: `DRIVER #${driverId}`,
      details: `Driver acknowledged operational update version ${version}`,
    });

    return true;
  }

  /**
   * Retorna o histórico de versões e auditoria de uma rota.
   */
  public async getRouteUpdates(routeId: number): Promise<RouteUpdateRecord[]> {
    const rows = await db
      .select()
      .from(routeUpdates)
      .where(eq(routeUpdates.route_id, routeId))
      .orderBy(sql`${routeUpdates.created_at} DESC`);

    return rows.map((r) => ({
      id: r.id,
      route_id: r.route_id,
      old_version: r.old_version,
      new_version: r.new_version,
      change_type: r.change_type as RouteChangeType,
      changed_fields: JSON.parse(r.changed_fields || '[]'),
      diff_summary: r.diff_summary,
      previous_snapshot: JSON.parse(r.previous_snapshot || '{}'),
      new_snapshot: r.new_snapshot ? JSON.parse(r.new_snapshot) : null,
      pending_proposal: r.pending_proposal ? JSON.parse(r.pending_proposal) : null,
      actor: r.actor,
      driver_approval_status: r.driver_approval_status as any,
      driver_decision_at: r.driver_decision_at,
      driver_acknowledged_at: r.driver_acknowledged_at,
      created_at: r.created_at,
    }));
  }
}

export const routeEditService = new RouteEditService();
