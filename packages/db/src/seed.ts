import 'dotenv/config';
import postgres from 'postgres';

/**
 * Seed script: populates realistic test data across 3 projects.
 * Run with: npx tsx packages/db/src/seed.ts
 */
async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const client = postgres(connectionString);

  console.log('[seed] Creating test projects...');

  // Project 1: Software-heavy
  const [p1] = await client`
    INSERT INTO projects (title, slug, summary, status, priority, repository_url, search_vector)
    VALUES (
      'BugBuster Firmware',
      'bugbuster-firmware-seed',
      'Embedded firmware for the BugBuster hardware debugger. RP2040-based with USB bulk streaming, logic analyzer, and oscilloscope features.',
      'active',
      'high',
      'https://github.com/example/bugbuster-firmware',
      'BugBuster Firmware embedded RP2040 USB debugger oscilloscope logic analyzer'
    )
    RETURNING id
  `;

  await client`
    INSERT INTO notes (project_id, kind, title, body, priority, search_vector) VALUES
    (${p1.id}, 'note', 'Architecture Notes', 'The firmware uses a dual-core architecture: Core 0 handles USB communication and Core 1 runs the ADC sampling and DMA transfers. The PIO is used for logic analyzer capture at up to 100 MHz.', 'medium', 'Architecture Notes dual-core USB ADC DMA PIO logic analyzer'),
    (${p1.id}, 'todo', 'Fix RLE streaming bug', 'The RLE decompression in the Tauri backend drops samples when the USB bulk buffer fills up. Need to implement flow control.', 'critical', 'Fix RLE streaming bug decompression Tauri USB bulk buffer flow control'),
    (${p1.id}, 'todo', 'Add VDAC calibration routine', 'The DAC output drifts after temperature changes. Need a calibration routine that can be triggered from the UI.', 'high', 'VDAC calibration routine DAC temperature drift')
  `;

  await client`
    INSERT INTO activity_events (project_id, actor, event_type, entity_type, entity_id, payload) VALUES
    (${p1.id}, 'trusted_device', 'project_created', 'project', ${p1.id}, '{"title":"BugBuster Firmware"}'::jsonb),
    (${p1.id}, 'trusted_device', 'note_created', 'note', ${p1.id}, '{"title":"Architecture Notes","kind":"note"}'::jsonb),
    (${p1.id}, 'trusted_device', 'note_created', 'note', ${p1.id}, '{"title":"Fix RLE streaming bug","kind":"todo"}'::jsonb)
  `;

  // Project 2: Hardware-heavy
  const [p2] = await client`
    INSERT INTO projects (title, slug, summary, status, priority, repository_url, search_vector)
    VALUES (
      'Solar Monitor PCB',
      'solar-monitor-pcb-seed',
      'Custom PCB for monitoring solar panel output. Includes INA226 current/voltage sensing, ESP32-S3 for WiFi, and an e-ink display for dashboard.',
      'active',
      'medium',
      'https://github.com/example/solar-monitor',
      'Solar Monitor PCB INA226 current voltage ESP32 WiFi e-ink display dashboard'
    )
    RETURNING id
  `;

  await client`
    INSERT INTO notes (project_id, kind, title, body, priority, search_vector) VALUES
    (${p2.id}, 'note', 'Component Selection', 'INA226 for high-side current sensing (±81.92V, 16-bit). ESP32-S3 for WiFi and BLE. GDEW0213T5 e-ink for low-power dashboard display. LM2596 buck converter for power regulation.', 'medium', 'Component Selection INA226 current sensing ESP32 WiFi BLE e-ink GDEW0213T5 LM2596 buck converter'),
    (${p2.id}, 'todo', 'Order PCB revision 3', 'Rev 2 had a routing issue on the I2C bus. Fixed in KiCad, ready to order from JLCPCB.', 'high', 'Order PCB revision 3 routing I2C KiCad JLCPCB'),
    (${p2.id}, 'todo', 'Test weatherproofing enclosure', 'The IP65 enclosure from AliExpress arrived. Need to verify gasket seal and cable gland fitment.', 'medium', 'Test weatherproofing enclosure IP65 gasket cable gland')
  `;

  await client`
    INSERT INTO activity_events (project_id, actor, event_type, entity_type, entity_id, payload) VALUES
    (${p2.id}, 'trusted_device', 'project_created', 'project', ${p2.id}, '{"title":"Solar Monitor PCB"}'::jsonb),
    (${p2.id}, 'trusted_device', 'note_created', 'note', ${p2.id}, '{"title":"Component Selection","kind":"note"}'::jsonb)
  `;

  // Project 3: Mixed notes/media
  const [p3] = await client`
    INSERT INTO projects (title, slug, summary, status, priority, repository_url, search_vector)
    VALUES (
      'Home Lab Infrastructure',
      'home-lab-infra-seed',
      'Documentation and tracking for the home lab setup: Proxmox cluster, networking, Docker services, backups, and monitoring.',
      'active',
      'low',
      '',
      'Home Lab Infrastructure Proxmox cluster networking Docker services backups monitoring'
    )
    RETURNING id
  `;

  await client`
    INSERT INTO notes (project_id, kind, title, body, priority, search_vector) VALUES
    (${p3.id}, 'note', 'Network Topology', 'Main router: Ubiquiti UDM Pro. Switch: USW-24-POE. APs: U6-LR x2. VLANs: Management (10), Servers (20), IoT (30), Guest (40). WireGuard VPN on the Proxmox host for remote access.', 'low', 'Network Topology Ubiquiti UDM Pro USW-24-POE U6-LR VLAN WireGuard VPN Proxmox'),
    (${p3.id}, 'note', 'Backup Strategy', '3-2-1 backup: Proxmox Backup Server for VM snapshots (daily), rclone to B2 (weekly encrypted), local NAS rsync (hourly for critical data). Retention: 30 days local, 90 days cloud.', 'medium', 'Backup Strategy 3-2-1 Proxmox Backup Server rclone B2 NAS rsync retention'),
    (${p3.id}, 'todo', 'Set up Grafana dashboards', 'Install Grafana + Prometheus. Add node-exporter to all Proxmox hosts. Create dashboards for CPU, RAM, disk, network, and temperature.', 'medium', 'Grafana dashboards Prometheus node-exporter CPU RAM disk network temperature'),
    (${p3.id}, 'todo', 'Migrate DNS to PiHole', 'Currently using UDM Pro DNS. Migrate to PiHole running in an LXC container for ad blocking and better logging.', 'low', 'DNS PiHole UDM Pro LXC container ad blocking')
  `;

  // Mark one todo as completed for timeline
  await client`
    UPDATE notes SET completed_at = NOW() - INTERVAL '2 days'
    WHERE project_id = ${p3.id} AND title = 'Migrate DNS to PiHole'
  `;

  await client`
    INSERT INTO activity_events (project_id, actor, event_type, entity_type, entity_id, payload) VALUES
    (${p3.id}, 'trusted_device', 'project_created', 'project', ${p3.id}, '{"title":"Home Lab Infrastructure"}'::jsonb),
    (${p3.id}, 'trusted_device', 'note_created', 'note', ${p3.id}, '{"title":"Network Topology","kind":"note"}'::jsonb),
    (${p3.id}, 'trusted_device', 'todo_completed', 'note', ${p3.id}, '{"title":"Migrate DNS to PiHole"}'::jsonb)
  `;

  console.log('[seed] Created 3 projects with notes, todos, and activity events');
  console.log('[seed] Done!');

  await client.end();
}

seed().catch((err) => {
  console.error('[seed] Error:', err);
  process.exit(1);
});
