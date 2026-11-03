use serialport::SerialPort;
use std::io::{Read, Write};
use std::sync::Mutex;
use std::time::Duration;

// Frame protocol constants
const HEADER1: u8 = 0xA1;
const HEADER2: u8 = 0xB1;
const DATA_TYPE: u8 = 0x80;
const FOOTER: u8 = 0xFE;

// Mission commands
const START_MISSION_CMD: u8 = 0x55;
const STOP_MISSION_CMD: u8 = 0x90;

pub struct SerialComm {
    port: Mutex<Option<Box<dyn SerialPort>>>,
    port_name: Mutex<String>,
    baud_rate: Mutex<u32>,
}

impl SerialComm {
    pub fn new(port_name: &str, baud_rate: u32) -> Self {
        Self {
            port: Mutex::new(None),
            port_name: Mutex::new(port_name.to_string()),
            baud_rate: Mutex::new(baud_rate),
        }
    }

    pub fn connect(&self, port_name: &str, baud_rate: u32) -> Result<(), String> {
        eprintln!("[serial] connect: opening {} at {} baud", port_name, baud_rate);
        let mut port = self.port.lock().map_err(|e| e.to_string())?;

        let serial_port = serialport::new(port_name, baud_rate)
            .timeout(Duration::from_millis(1000))
            .open()
            .map_err(|e| format!("Failed to open serial port: {}", e))?;

        *port = Some(serial_port);
        // Update stored values so future reconnects use the same port/baud
        *self.port_name.lock().map_err(|e| e.to_string())? = port_name.to_string();
        *self.baud_rate.lock().map_err(|e| e.to_string())? = baud_rate;
        Ok(())
    }

    pub fn disconnect(&self) -> Result<(), String> {
        let mut port = self.port.lock().map_err(|e| e.to_string())?;
        *port = None;
        Ok(())
    }

    pub fn is_connected(&self) -> bool {
        self.port.lock().map(|p| p.is_some()).unwrap_or(false)
    }

    pub fn get_port_name(&self) -> String {
        self.port_name.lock().map(|p| p.clone()).unwrap_or_default()
    }

    pub fn get_baud_rate(&self) -> u32 {
        self.baud_rate.lock().map(|b| *b).unwrap_or(0)
    }

    pub fn send_data(&self, data: &[u8]) -> Result<(), String> {
        let mut port = self.port.lock().map_err(|e| e.to_string())?;

        if let Some(ref mut p) = *port {
            p.write_all(data)
                .map_err(|e| format!("Failed to write to serial port: {}", e))?;
            p.flush()
                .map_err(|e| format!("Failed to flush serial port: {}", e))?;
            Ok(())
        } else {
            Err("Serial port not connected".to_string())
        }
    }

    pub fn receive_data(&self, buffer: &mut [u8]) -> Result<usize, String> {
        let mut port = self.port.lock().map_err(|e| e.to_string())?;

        if let Some(ref mut p) = *port {
            p.read(buffer)
                .map_err(|e| format!("Failed to read from serial port: {}", e))
        } else {
            Err("Serial port not connected".to_string())
        }
    }

    pub fn send_with_ack(&self, data: &[u8], timeout_ms: u64) -> Result<Vec<u8>, String> {
        // Send the data
        self.send_data(data)?;

        // Wait for ACK
        let start = std::time::Instant::now();
        let mut buffer = [0u8; 256];

        while start.elapsed() < Duration::from_millis(timeout_ms) {
            match self.receive_data(&mut buffer) {
                Ok(n) if n > 0 => {
                    return Ok(buffer[..n].to_vec());
                }
                _ => {
                    std::thread::sleep(Duration::from_millis(10));
                }
            }
        }

        Err("Timeout waiting for ACK".to_string())
    }

    pub fn receive_line(&self, timeout_ms: u64) -> Result<String, String> {
        let start = std::time::Instant::now();
        eprintln!("[serial] receive_line: acquiring lock...");
        let mut port = self.port.lock().map_err(|e| e.to_string())?;
        eprintln!("[serial] receive_line: lock acquired (waited {:?})", start.elapsed());

        if let Some(ref mut p) = *port {
            let mut buffer = vec![0u8; 1024];
            let mut line = String::new();
            let start = std::time::Instant::now();

            while start.elapsed() < Duration::from_millis(timeout_ms) {
                match p.read(&mut buffer) {
                    Ok(n) if n > 0 => {
                        line.push_str(&String::from_utf8_lossy(&buffer[..n]));
                        if line.contains('\n') {
                            return Ok(line.trim_end().to_string());
                        }
                    }
                    _ => {
                        std::thread::sleep(Duration::from_millis(10));
                    }
                }
            }

            if line.is_empty() {
                Err("Timeout - no data received".to_string())
            } else {
                Ok(line.trim_end().to_string())
            }
        } else {
            Err("Serial port not connected".to_string())
        }
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
        let length = data.len() as u8 + 2; // +2 for checksum and footer
        let header = [HEADER1, HEADER2, DATA_TYPE, length];
        let checksum = Self::calculate_checksum(&header, data);

        let mut frame = Vec::with_capacity(4 + data.len() + 2);
        frame.extend_from_slice(&header);
        frame.extend_from_slice(data);
        frame.push(checksum);
        frame.push(FOOTER);
        frame
    }

    pub fn send_frame(&self, data: &[u8]) -> Result<(), String> {
        let frame = Self::build_frame(data);
        self.send_data(&frame)
    }

    pub fn receive_frame(&self, timeout_ms: u64) -> Result<Vec<u8>, String> {
        let mut port = self.port.lock().map_err(|e| e.to_string())?;
        let port = port.as_mut().ok_or("Serial port not connected")?;

        let deadline = std::time::Instant::now() + Duration::from_millis(timeout_ms);
        let mut buf = [0u8; 1];

        // Scan for HEADER1
        loop {
            if std::time::Instant::now() > deadline {
                return Err("Timeout waiting for frame header".to_string());
            }
            match port.read(&mut buf) {
                Ok(1) if buf[0] == HEADER1 => break,
                Ok(_) => continue,
                Err(_) => {
                    std::thread::sleep(Duration::from_millis(10));
                }
            }
        }

        // Read HEADER2 and DATA_TYPE
        let mut header = vec![HEADER1];
        for &expected in &[HEADER2, DATA_TYPE] {
            if port.read(&mut buf).map_err(|e| e.to_string())? != 1 {
                return Err("Failed to read frame header".to_string());
            }
            if buf[0] != expected {
                return Err(format!(
                    "Invalid frame header: expected {:#04x}, got {:#04x}",
                    expected, buf[0]
                ));
            }
            header.push(buf[0]);
        }

        // Read LENGTH
        if port.read(&mut buf).map_err(|e| e.to_string())? != 1 {
            return Err("Failed to read frame length".to_string());
        }
        let length = buf[0] as usize;
        header.push(buf[0]);

        if length < 2 {
            return Err(format!("Frame length too short: {}", length));
        }

        // Read payload (data + checksum + footer)
        let mut payload = vec![0u8; length];
        let mut offset = 0;
        while offset < length {
            if std::time::Instant::now() > deadline {
                return Err("Timeout reading frame payload".to_string());
            }
            match port.read(&mut payload[offset..]) {
                Ok(0) => {
                    std::thread::sleep(Duration::from_millis(10));
                }
                Ok(n) => offset += n,
                Err(_) => {
                    std::thread::sleep(Duration::from_millis(10));
                }
            }
        }

        let footer = payload[length - 1];
        let received_checksum = payload[length - 2];
        let data = &payload[..length - 2];

        if footer != FOOTER {
            return Err(format!("Invalid frame footer: {:#04x}", footer));
        }

        let expected_checksum = Self::calculate_checksum(&header, data);
        if received_checksum != expected_checksum {
            return Err(format!(
                "Frame checksum mismatch: expected {:#04x}, got {:#04x}",
                expected_checksum, received_checksum
            ));
        }

        Ok(data.to_vec())
    }

    fn send_frame_and_receive(&self, data: &[u8], timeout_ms: u64) -> Result<Vec<u8>, String> {
        let frame = Self::build_frame(data);
        eprintln!(
            "[serial] send_frame_and_receive: frame={} ({})",
            frame.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" "),
            frame.len()
        );

        eprintln!("[serial] acquiring port lock...");
        let mut port = self.port.lock().map_err(|e| e.to_string())?;
        let port = port.as_mut().ok_or("Serial port not connected")?;
        eprintln!("[serial] port lock acquired");

        // Send the frame while holding the lock
        port.write_all(&frame)
            .map_err(|e| format!("Failed to write to serial port: {}", e))?;
        port.flush()
            .map_err(|e| format!("Failed to flush serial port: {}", e))?;
        eprintln!("[serial] frame written and flushed ({} bytes)", frame.len());

        // Receive the response while still holding the lock
        let deadline = std::time::Instant::now() + Duration::from_millis(timeout_ms);
        let mut buf = [0u8; 1];
        let mut read_attempts = 0;

        // Scan for HEADER1
        loop {
            if std::time::Instant::now() > deadline {
                eprintln!("[serial] timeout waiting for frame header after {} attempts", read_attempts);
                return Err("Timeout waiting for frame header".to_string());
            }
            match port.read(&mut buf) {
                Ok(1) if buf[0] == HEADER1 => {
                    eprintln!("[serial] got HEADER1 after {} attempts", read_attempts);
                    break;
                }
                Ok(n) => {
                    if read_attempts < 5 || read_attempts % 50 == 0 {
                        eprintln!("[serial] read {} bytes: {:02X} (attempt {})", n, buf[0], read_attempts);
                    }
                    read_attempts += 1;
                    continue;
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut || e.kind() == std::io::ErrorKind::WouldBlock => {
                    read_attempts += 1;
                    continue;
                }
                Err(ref e) => {
                    eprintln!("[serial] read error: {} (attempt {})", e, read_attempts);
                    read_attempts += 1;
                    std::thread::sleep(Duration::from_millis(10));
                }
            }
        }

        // Read HEADER2 and DATA_TYPE
        let mut header = vec![HEADER1];
        for &expected in &[HEADER2, DATA_TYPE] {
            if port.read(&mut buf).map_err(|e| e.to_string())? != 1 {
                return Err("Failed to read frame header".to_string());
            }
            if buf[0] != expected {
                return Err(format!(
                    "Invalid frame header: expected {:#04x}, got {:#04x}",
                    expected, buf[0]
                ));
            }
            header.push(buf[0]);
        }

        // Read LENGTH
        if port.read(&mut buf).map_err(|e| e.to_string())? != 1 {
            return Err("Failed to read frame length".to_string());
        }
        let length = buf[0] as usize;
        header.push(buf[0]);

        if length < 2 {
            return Err(format!("Frame length too short: {}", length));
        }

        // Read payload (data + checksum + footer)
        let mut payload = vec![0u8; length];
        let mut offset = 0;
        while offset < length {
            if std::time::Instant::now() > deadline {
                return Err("Timeout reading frame payload".to_string());
            }
            match port.read(&mut payload[offset..]) {
                Ok(0) => {
                    std::thread::sleep(Duration::from_millis(10));
                }
                Ok(n) => offset += n,
                Err(_) => {
                    std::thread::sleep(Duration::from_millis(10));
                }
            }
        }

        let footer = payload[length - 1];
        let received_checksum = payload[length - 2];
        let data = &payload[..length - 2];

        if footer != FOOTER {
            return Err(format!("Invalid frame footer: {:#04x}", footer));
        }

        let expected_checksum = Self::calculate_checksum(&header, data);
        if received_checksum != expected_checksum {
            return Err(format!(
                "Frame checksum mismatch: expected {:#04x}, got {:#04x}",
                expected_checksum, received_checksum
            ));
        }

        Ok(data.to_vec())
    }

    pub fn send_start_mission(&self) -> Result<Vec<u8>, String> {
        self.send_frame_and_receive(&[START_MISSION_CMD], 5000)
    }

    pub fn send_stop_mission(&self) -> Result<Vec<u8>, String> {
        self.send_frame_and_receive(&[STOP_MISSION_CMD], 5000)
    }
}
