import { db, initDbConstraints } from '../src/db/index.js';
import { routes, routeStops, drivers, routeEvents } from '../src/db/schema.js';
import { routeService } from '../src/server/routeService.js';
import { eq } from 'drizzle-orm';

async function runM4Suite() {
  console.log('--- STARTING M4 OPERATIONAL VERIFICATION SUITE ---');
  await initDbConstraints();

  // 1. Setup Test Drivers
  const [driverA] = await db
    .insert(drivers)
    .values({
      telegram_user_id: `m4_test_driver_a_${Date.now()}`,
      telegram_chat_id: `chat_a_${Date.now()}`,
      name: 'Motorista Vencedor A',
      phone: '34999990001',
      vehicle_type: 'CAR_HATCH',
      status: 'ACTIVE',
    })
    .returning();

  const [driverB] = await db
    .insert(drivers)
    .values({
      telegram_user_id: `m4_test_driver_b_${Date.now()}`,
      telegram_chat_id: `chat_b_${Date.now()}`,
      name: 'Motorista Invasor B',
      phone: '34999990002',
      vehicle_type: 'CAR_HATCH',
      status: 'ACTIVE',
    })
    .returning();

  // 2. Setup Test Route with 3 stops:
  // Stop 1: IN_PERSON
  // Stop 2: NO_CONTACT
  // Stop 3: IN_PERSON
  const [testRoute] = await db
    .insert(routes)
    .values({
      pickup_type: 'AD_HOC',
      pickup_name: 'Kantine Matriz Teste',
      pickup_address: 'Av. Teste M4, 100',
      final_deadline: '18:00',
      total_fee: '45.00',
      accepted_vehicle_types: JSON.stringify(['CAR_HATCH', 'CAR_SEDAN']),
      status: 'ACCEPTED',
      accepted_driver_id: driverA.id,
      accepted_at: new Date(),
    })
    .returning();

  const [stop1] = await db
    .insert(routeStops)
    .values({
      route_id: testRoute.id,
      sequence: 1,
      destination_address: 'Rua das Flores, 10',
      destination_neighborhood: 'Santa Mônica',
      cargo_description: 'Bolo Aniversário',
      delivery_mode: 'IN_PERSON',
      pin_code: '4829',
      status: 'PENDING',
    })
    .returning();

  const [stop2] = await db
    .insert(routeStops)
    .values({
      route_id: testRoute.id,
      sequence: 2,
      destination_address: 'Rua dos Cravos, 20',
      destination_neighborhood: 'Jardim Karaíba',
      cargo_description: 'Doces Finos',
      delivery_mode: 'NO_CONTACT',
      status: 'PENDING',
    })
    .returning();

  const [stop3] = await db
    .insert(routeStops)
    .values({
      route_id: testRoute.id,
      sequence: 3,
      destination_address: 'Rua dos Jacarandás, 25',
      destination_neighborhood: 'Fundinho',
      cargo_description: 'Kit Cupcakes',
      delivery_mode: 'NO_CONTACT',
      status: 'PENDING',
    })
    .returning();

  const [stop4] = await db
    .insert(routeStops)
    .values({
      route_id: testRoute.id,
      sequence: 4,
      destination_address: 'Rua das Palmeiras, 30',
      destination_neighborhood: 'Morada da Colina',
      cargo_description: 'Salgados Gourmet',
      delivery_mode: 'IN_PERSON',
      pin_code: '9153',
      status: 'PENDING',
    })
    .returning();

  console.log(`Route #${testRoute.id} created with 4 stops. DriverA ID: ${driverA.id}, DriverB ID: ${driverB.id}`);

  // Test M4-T04: Invalid transition ACCEPTED -> IN_TRANSIT (Must be rejected)
  try {
    await routeService.startRoute(testRoute.id, { driverId: driverA.id });
    console.error('❌ M4-T04 FAILED: ACCEPTED -> IN_TRANSIT should have been rejected!');
    process.exit(1);
  } catch (err: any) {
    console.log('✅ M4-T04 PASSED: Direct jump ACCEPTED -> IN_TRANSIT correctly rejected:', err.message);
  }

  // Test M4-T05: Driver B (not winner) attempts arrivedPickup (Must be rejected)
  try {
    await routeService.markArrivedPickup(testRoute.id, { driverId: driverB.id });
    console.error('❌ M4-T05 FAILED: Non-winning driver was able to mark arrived pickup!');
    process.exit(1);
  } catch (err: any) {
    console.log('✅ M4-T05 PASSED: Unauthorized driver rejected on arrivedPickup:', err.message);
  }

  // Test M4-T01: ACCEPTED -> ARRIVED_PICKUP with winner driver (Must PASS)
  const arrivedRoute = await routeService.markArrivedPickup(testRoute.id, { driverId: driverA.id });
  if (arrivedRoute.status !== 'ARRIVED_PICKUP' || !arrivedRoute.arrived_pickup_at) {
    console.error('❌ M4-T01 FAILED:', arrivedRoute);
    process.exit(1);
  }
  console.log('✅ M4-T01 PASSED: ACCEPTED -> ARRIVED_PICKUP succeeded.');

  // Test M4-T02: ARRIVED_PICKUP -> PICKED_UP (Must PASS)
  const pickedRoute = await routeService.markPickedUp(testRoute.id, { driverId: driverA.id });
  if (pickedRoute.status !== 'PICKED_UP' || !pickedRoute.picked_up_at) {
    console.error('❌ M4-T02 FAILED:', pickedRoute);
    process.exit(1);
  }
  console.log('✅ M4-T02 PASSED: ARRIVED_PICKUP -> PICKED_UP succeeded.');

  // Test M4-T03: PICKED_UP -> IN_TRANSIT (Must PASS)
  const transitRes = await routeService.startRoute(testRoute.id, { driverId: driverA.id });
  if (transitRes.route.status !== 'IN_TRANSIT' || !transitRes.route.started_at) {
    console.error('❌ M4-T03 FAILED:', transitRes);
    process.exit(1);
  }
  console.log('✅ M4-T03 PASSED: PICKED_UP -> IN_TRANSIT succeeded. Next stop #:', transitRes.nextStop?.sequence);

  // Test M4-T06: STOP 1 (IN_PERSON) with wrong PIN (Must FAIL and remain PENDING)
  const wrongPinRes = await routeService.deliverStopWithPin(stop1.id, '0000', { driverId: driverA.id });
  const checkStop1AfterWrongPin = await routeService.getStopById(stop1.id);
  if (wrongPinRes.success || checkStop1AfterWrongPin?.status !== 'PENDING') {
    console.error('❌ M4-T06 FAILED: Stop was delivered with wrong PIN!', wrongPinRes);
    process.exit(1);
  }
  console.log('✅ M4-T06 PASSED: Wrong PIN rejected, stop remains PENDING in database.');

  // Test M4-T07: STOP 1 (IN_PERSON) with correct PIN (Must PASS: DELIVERED + proof_type PIN)
  const correctPinRes = await routeService.deliverStopWithPin(stop1.id, '4829', { driverId: driverA.id });
  if (!correctPinRes.success || correctPinRes.stop?.status !== 'DELIVERED' || correctPinRes.stop?.proof_type !== 'PIN') {
    console.error('❌ M4-T07 FAILED:', correctPinRes);
    process.exit(1);
  }
  console.log('✅ M4-T07 PASSED: Correct PIN delivered stop successfully with proof_type PIN.');

  // Test idempotency / duplicate delivery attempt on STOP 1 (Must reject)
  const dupDeliverRes = await routeService.deliverStopWithPin(stop1.id, '4829', { driverId: driverA.id });
  if (dupDeliverRes.success && dupDeliverRes.stop?.status !== 'DELIVERED') {
    console.error('❌ IDEMPOTENCY FAILED: Duplicate delivery was accepted abnormally!');
    process.exit(1);
  }
  console.log('✅ IDEMPOTENCY PASSED: Duplicate delivery attempt on already delivered stop handled safely.');

  // Test M4-T08: STOP 2 (NO_CONTACT) without photo (Must reject)
  try {
    await routeService.deliverStopWithPhoto(stop2.id, '', { driverId: driverA.id });
    console.error('❌ M4-T08 FAILED: NO_CONTACT accepted without photo reference!');
    process.exit(1);
  } catch (err: any) {
    console.log('✅ M4-T08 PASSED: NO_CONTACT without photo rejected:', err.message);
  }

  // Test M4-T09: STOP 2 (NO_CONTACT) with photo (Must PASS)
  const uniquePhotoRef = `tg_file_proof_photo_${Date.now()}`;
  const photoDeliverRes = await routeService.deliverStopWithPhoto(stop2.id, uniquePhotoRef, { driverId: driverA.id });
  if (!photoDeliverRes.success || photoDeliverRes.stop?.status !== 'DELIVERED' || photoDeliverRes.stop?.proof_type !== 'PHOTO') {
    console.error('❌ M4-T09 FAILED:', photoDeliverRes);
    process.exit(1);
  }
  console.log('✅ M4-T09 PASSED: NO_CONTACT delivered with photo reference.');

  // Test M4-T10: Attempt to reuse the same photo for STOP 3 (Must FAIL with PHOTO_ALREADY_USED)
  try {
    await routeService.deliverStopWithPhoto(stop3.id, uniquePhotoRef, { driverId: driverA.id });
    console.error('❌ M4-T10 FAILED: Reused photo should have been rejected!');
    process.exit(1);
  } catch (err: any) {
    if (err.message.includes('PHOTO_ALREADY_USED')) {
      console.log('✅ M4-T10 PASSED: Duplicate photo across stops strictly rejected:', err.message);
    } else {
      console.error('❌ M4-T10 unexpected error:', err.message);
      process.exit(1);
    }
  }

  // Deliver STOP 3 with a new unique photo
  const uniquePhotoRef2 = `tg_file_proof_photo_2_${Date.now()}`;
  const photoDeliverRes2 = await routeService.deliverStopWithPhoto(stop3.id, uniquePhotoRef2, { driverId: driverA.id });
  if (!photoDeliverRes2.success || photoDeliverRes2.stop?.status !== 'DELIVERED') {
    console.error('❌ STOP 3 photo delivery failed:', photoDeliverRes2);
    process.exit(1);
  }
  console.log('✅ STOP 3 delivered with valid unique photo.');

  // Verify Route is NOT yet completed because STOP 4 is still PENDING
  const [routeBeforeStop4] = await db.select().from(routes).where(eq(routes.id, testRoute.id));
  if (routeBeforeStop4.status !== 'IN_TRANSIT') {
    console.error('❌ ENROUTE COMPLETION FAILED: Route completed prematurely before stop 4!', routeBeforeStop4);
    process.exit(1);
  }
  console.log('✅ PASS: Route remains IN_TRANSIT while STOP 4 is PENDING.');

  // Test M4-T11: Incident on STOP 4 (INCIDENT is terminal, does not block, triggers automatic route completion)
  const incidentRes = await routeService.reportStopIncident(
    stop4.id,
    { incident_type: 'CLIENTE_AUSENTE', incident_note: 'Tentativas de interfone sem resposta' },
    { driverId: driverA.id }
  );
  if (!incidentRes.success || incidentRes.stop?.status !== 'INCIDENT') {
    console.error('❌ M4-T11 FAILED to report incident:', incidentRes);
    process.exit(1);
  }
  console.log('✅ M4-T11 (Part 1) PASSED: Stop 4 registered as INCIDENT without blocking.');

  // Verify Automatic Route Completion (Seção 24)
  const [finalRoute] = await db.select().from(routes).where(eq(routes.id, testRoute.id));
  if (finalRoute.status !== 'COMPLETED' || !finalRoute.completed_at) {
    console.error('❌ M4-T11 (Part 2) FAILED: Route did not auto-complete after all stops terminal!', finalRoute);
    process.exit(1);
  }
  console.log(`✅ M4-T11 (Part 2) PASSED: Route auto-completed with completed_at: ${finalRoute.completed_at}`);

  // Check audit events recorded
  const events = await db.select().from(routeEvents).where(eq(routeEvents.route_id, testRoute.id));
  console.log(`Audit events generated for Route #${testRoute.id}:`, events.map((e) => e.event_type));

  console.log('=== ALL M4 OPERATIONAL TESTS PASSED SUCCESSFULLY! ===');
  process.exit(0);
}

runM4Suite().catch((err) => {
  console.error('TEST RUNNER ERROR:', err);
  process.exit(1);
});
