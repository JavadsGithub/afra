use rand::RngExt;
use serde::Serialize;
use std::io::{Read, Write};
use std::time::Duration;

// Frame protocol constants (mirrors serial_comm.rs)
const HEADER1: u8 = 0xA1;
const HEADER2: u8 = 0xB1;
const DATA_TYPE: u8 = 0x80;
const FOOTER: u8 = 0xFE;

const START_MISSION_CMD: u8 = 0x55;
const STOP_MISSION_CMD: u8 = 0x90;

#[derive(Serialize)]
struct Telemetry {
    latitude: f64,
    longitude: f64,
    yaw: f64,
    depth: f64,
    rps: f64,
    ampere: f64,
    wtd: f64,
    temperature: f64,
    timestamp: f64,
    speed: f64,
    battery_level: f64,
    mission_id: f64,
    status: f64,
    error: f64,
}

fn scan_ports() -> Vec<(String, String)> {
    let mut ports = Vec::new();

    #[cfg(target_os = "linux")]
    {
        let prefixes = ["ttyUSB", "ttyACM", "ttyS", "ttyAMA", "ttyTHS"];
        if let Ok(entries) = std::fs::read_dir("/dev") {
            for entry in entries.flatten() {
                if let Some(name) = entry.file_name().to_str() {
                    if prefixes.iter().any(|p| name.starts_with(p))
                        && name.chars().any(|c| c.is_ascii_digit())
                    {
                        let path = entry.path().to_string_lossy().to_string();
                        if std::fs::OpenOptions::new()
                            .read(true)
                            .write(true)
                            .open(&path)
                            .is_ok()
                        {
                            ports.push((name.to_string(), path));
                        }
                    }
                }
            }
        }
        if let Ok(pts_entries) = std::fs::read_dir("/dev/pts") {
            for entry in pts_entries.flatten() {
                if let Some(name) = entry.file_name().to_str() {
                    if name.chars().all(|c| c.is_ascii_digit()) {
                        let path = entry.path().to_string_lossy().to_string();
                        if std::fs::OpenOptions::new()
                            .read(true)
                            .write(true)
                            .open(&path)
                            .is_ok()
                        {
                            ports.push((format!("pts/{}", name), path));
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        for i in 1..=16 {
            let path = format!("\\\\.\\COM{}", i);
            if std::fs::OpenOptions::new()
                .read(true)
                .write(true)
                .open(&path)
                .is_ok()
            {
                ports.push((format!("COM{}", i), path));
            }
        }
    }

    ports
}

fn calculate_checksum(header: &[u8], data: &[u8]) -> u8 {
    let mut chk: u8 = 0;
    for &b in header {
        chk ^= b;
    }
    for &b in data {
        chk ^= b;
    }
    chk
}

fn build_frame(data: &[u8]) -> Vec<u8> {
    let length = data.len() as u8 + 2;
    let header = [HEADER1, HEADER2, DATA_TYPE, length];
    let checksum = calculate_checksum(&header, data);

    let mut frame = Vec::with_capacity(4 + data.len() + 2);
    frame.extend_from_slice(&header);
    frame.extend_from_slice(data);
    frame.push(checksum);
    frame.push(FOOTER);
    frame
}

fn main() {
    let ports = scan_ports();

    if ports.is_empty() {
        eprintln!("No serial ports found!");
        std::process::exit(1);
    }

    println!("Available ports:");
    for (i, (name, path)) in ports.iter().enumerate() {
        println!("  [{}] {} ({})", i, name, path);
    }

    let selection: usize = loop {
        print!("Select port number for robot simulator: ");
        std::io::stdout().flush().unwrap();

        let mut input = String::new();
        std::io::stdin().read_line(&mut input).unwrap();
        match input.trim().parse() {
            Ok(n) if n < ports.len() => break n,
            _ => println!("Invalid selection, try again."),
        }
    };

    let (_, port_path) = &ports[selection];

    print!("Baud rate [115200]: ");
    std::io::stdout().flush().unwrap();
    let mut baud_input = String::new();
    std::io::stdin().read_line(&mut baud_input).unwrap();
    let baud: u32 = baud_input.trim().parse().unwrap_or(115200);

    let mut port = serialport::new(port_path, baud)
        .timeout(Duration::from_millis(500))
        .open()
        .expect("Failed to open port");

    println!("Robot simulator running on {} at {} baud\n", port_path, baud);

    let mut rng = rand::rng();
    let mut timestamp: f64 = 0.0;
    let mut mission_active = false;
    let mut line_buf = Vec::new();

    // Start telemetry timer
    let mut last_telemetry = std::time::Instant::now();

    loop {
        // Send telemetry if mission is active
        if mission_active && last_telemetry.elapsed() >= Duration::from_secs(2) {
            let telemetry = Telemetry {
                latitude: 35.7 + rng.random_range(-0.01..0.01),
                longitude: 51.4 + rng.random_range(-0.01..0.01),
                yaw: rng.random_range(0.0..360.0),
                depth: rng.random_range(0.0..50.0),
                rps: rng.random_range(0.0..10.0),
                ampere: rng.random_range(0.5..5.0),
                wtd: rng.random_range(0.0..120.0),
                temperature: rng.random_range(15.0..35.0),
                timestamp,
                speed: rng.random_range(0.0..5.0),
                battery_level: rng.random_range(60.0..100.0),
                mission_id: 1.0,
                status: 1.0,
                error: 0.0,
            };

            let json = serde_json::to_string(&telemetry).expect("Failed to serialize");
            let data = format!("{}\n", json);

            port.write_all(data.as_bytes()).expect("Failed to write");
            port.flush().expect("Failed to flush");
            println!("Sent Telemetry: {}", json);

            timestamp += 1.0;
            last_telemetry = std::time::Instant::now();
        }

        // Read raw data from port
        let mut raw = [0u8; 1024];
        match port.read(&mut raw) {
            Ok(0) => {
                // No data, continue loop
            }
            Ok(n) => {
                let data = &raw[..n];
                let mut i = 0;

                while i < data.len() {
                    // Look for frame start
                    if data[i] == HEADER1
                        && i + 3 < data.len()
                        && data[i + 1] == HEADER2
                        && data[i + 2] == DATA_TYPE
                    {
                        let length = data[i + 3] as usize;
                        let frame_end = i + 4 + length;

                        if frame_end <= data.len() {
                            let header = &data[i..i + 4];
                            let payload = &data[i + 4..frame_end];
                            let data_bytes = &payload[..payload.len() - 2];
                            let received_checksum = payload[payload.len() - 2];
                            let footer = payload[payload.len() - 1];

                            let expected_checksum = calculate_checksum(header, data_bytes);

                            if footer == FOOTER && received_checksum == expected_checksum {
                                let cmd = data_bytes[0];
                                match cmd {
                                    START_MISSION_CMD => {
                                        println!("Received: FRAME Start Mission");
                                        let ack = build_frame(b"OK");
                                        port.write_all(&ack).expect("Failed to write ACK");
                                        port.flush().expect("Failed to flush");
                                        println!("  -> Sent: ACK frame");
                                        mission_active = true;
                                        last_telemetry = std::time::Instant::now();
                                        println!("  -> Mission ACTIVE, telemetry started\n");
                                    }
                                    STOP_MISSION_CMD => {
                                        println!("Received: FRAME Stop Mission");
                                        let ack = build_frame(b"OK");
                                        port.write_all(&ack).expect("Failed to write ACK");
                                        port.flush().expect("Failed to flush");
                                        println!("  -> Sent: ACK frame");
                                        mission_active = false;
                                        println!("  -> Mission STOPPED, telemetry halted\n");
                                    }
                                    _ => {
                                        println!(
                                            "Received: FRAME unknown cmd {:#04x}\n",
                                            cmd
                                        );
                                    }
                                }
                                i = frame_end;
                                continue;
                            } else {
                                eprintln!("  -> Frame checksum/footer mismatch");
                            }
                        } else {
                            eprintln!("  -> Incomplete frame in buffer");
                        }
                    }

                    // Not a frame byte — accumulate for line parsing
                    let b = data[i];
                    line_buf.push(b);
                    if b == b'\n' {
                        flush_line(&mut line_buf, &mut port);
                    }
                    i += 1;
                }
            }
            Err(_) => {
                // Timeout, continue loop
            }
        }
    }
}

fn flush_line(line_buf: &mut Vec<u8>, port: &mut Box<dyn serialport::SerialPort>) {
    if line_buf.is_empty() {
        return;
    }

    let line = String::from_utf8_lossy(line_buf).trim().to_string();
    line_buf.clear();

    if line.is_empty() {
        return;
    }

    println!("Received: {}", line);

    if let Ok(pins) = serde_json::from_str::<serde_json::Value>(&line) {
        if pins.is_array() {
            println!(
                "  -> Got {} pins, sending ACK",
                pins.as_array().unwrap().len()
            );
        }
    }

    port.write_all(b"ACK\n").expect("Failed to write ACK");
    port.flush().expect("Failed to flush");
    println!("  -> Sent: ACK\n");
}
