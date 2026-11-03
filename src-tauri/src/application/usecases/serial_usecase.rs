use crate::domain::entities::pin::Pin;
use crate::domain::entities::telemetry::Telemetry;
use crate::domain::repositories::telemetry_repository::TelemetryRepository;
use crate::infrastructure::serial_comm::SerialComm;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};

pub struct SerialUseCase {
    serial: Arc<SerialComm>,
    telemetry_repo: Arc<dyn TelemetryRepository>,
    listening: Arc<AtomicBool>,
    suspended: Arc<AtomicBool>,
    connected: Mutex<bool>,
}

impl SerialUseCase {
    pub fn new(serial: Arc<SerialComm>, telemetry_repo: Arc<dyn TelemetryRepository>) -> Self {
        Self {
            serial,
            telemetry_repo,
            listening: Arc::new(AtomicBool::new(false)),
            suspended: Arc::new(AtomicBool::new(false)),
            connected: Mutex::new(false),
        }
    }

    pub async fn connect(&self, port_name: &str, baud_rate: u32) -> Result<(), String> {
        self.serial.connect(port_name, baud_rate)?;
        let mut connected = self.connected.lock().await;
        *connected = true;
        // Start listening automatically upon connection
        let _ = self.start_listening().await;
        Ok(())
    }

    pub async fn disconnect(&self) -> Result<(), String> {
        let _ = self.stop_listening().await;
        self.serial.disconnect()?;
        let mut connected = self.connected.lock().await;
        *connected = false;
        Ok(())
    }

    pub async fn is_connected(&self) -> bool {
        *self.connected.lock().await
    }

    pub fn get_port_name(&self) -> String {
        self.serial.get_port_name()
    }

    pub fn get_baud_rate(&self) -> u32 {
        self.serial.get_baud_rate()
    }

    pub async fn send_pins(&self, pins: Vec<Pin>) -> Result<String, String> {
        // Serialize pins to JSON
        let json =
            serde_json::to_string(&pins).map_err(|e| format!("Failed to serialize pins: {}", e))?;

        // Send with newline delimiter
        let data = format!("{}\n", json);

        self.serial.send_data(data.as_bytes())?;

        // Wait for ACK/NACK line response
        let response = self.serial.receive_line(5000)?;

        Ok(response)
    }

    pub async fn start_listening(&self) -> Result<(), String> {
        if self.listening.swap(true, Ordering::Relaxed) {
            return Err("Already listening".to_string());
        }

        let serial = self.serial.clone();
        let repo = self.telemetry_repo.clone();
        let listening = self.listening.clone();
        let suspended = self.suspended.clone();

        tokio::spawn(async move {
            loop {
                if !listening.load(Ordering::Relaxed) {
                    break;
                }
                if suspended.load(Ordering::Relaxed) {
                    sleep(Duration::from_millis(50)).await;
                    continue;
                }
                match serial.receive_line(1000) {
                    Ok(line) => {
                        eprintln!("[listener] received line: {:?}", &line[..line.len().min(80)]);
                        // Try to parse as Telemetry
                        if let Ok(telemetry) = serde_json::from_str::<Telemetry>(&line) {
                            let mut existing =
                                repo.load_telemetries().await.unwrap_or_else(|_| Vec::new());
                            existing.push(telemetry);
                            let count = existing.len();
                            if let Err(e) = repo.save_telemetries(existing).await {
                                eprintln!("[listener] save failed: {}", e);
                            }
                            eprintln!("[listener] saved telemetry #{}", count);
                        } else {
                            eprintln!("[listener] failed to parse as Telemetry");
                        }
                    }
                    Err(e) => {
                        eprintln!("[listener] error: {}", e);
                    }
                }
                sleep(Duration::from_millis(100)).await;
            }
        });

        Ok(())
    }

    pub async fn stop_listening(&self) -> Result<(), String> {
        self.listening.store(false, Ordering::Relaxed);
        Ok(())
    }

    pub async fn send_start_mission(&self, pins: Vec<Pin>) -> Result<Vec<u8>, String> {
        self.suspended.store(true, Ordering::Relaxed);
        sleep(Duration::from_millis(50)).await;

        let serial = self.serial.clone();
        let ack = match tokio::task::spawn_blocking(move || serial.send_start_mission())
            .await
            .map_err(|e| format!("Task join error: {}", e))?
        {
            Ok(data) => data,
            Err(e) => {
                self.suspended.store(false, Ordering::Relaxed);
                return Err(e);
            }
        };

        if !pins.is_empty() {
            if let Err(e) = self.send_pins(pins).await {
                self.suspended.store(false, Ordering::Relaxed);
                return Err(e);
            }
        }

        self.suspended.store(false, Ordering::Relaxed);
        Ok(ack)
    }

    pub async fn send_stop_mission(&self) -> Result<Vec<u8>, String> {
        self.suspended.store(true, Ordering::Relaxed);
        sleep(Duration::from_millis(50)).await;

        let serial = self.serial.clone();
        let result = tokio::task::spawn_blocking(move || serial.send_stop_mission())
            .await
            .map_err(|e| format!("Task join error: {}", e))?;

        self.suspended.store(false, Ordering::Relaxed);
        result
    }
}
