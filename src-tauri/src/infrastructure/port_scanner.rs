#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PortInfo {
    pub name: String,
    pub path: String,
}

pub fn scan_ports() -> Vec<PortInfo> {
    let mut ports = Vec::new();

    #[cfg(target_os = "linux")]
    {
        let serial_prefixes = ["ttyUSB", "ttyACM", "ttyS", "ttyAMA", "ttyTHS"];
        if let Ok(entries) = std::fs::read_dir("/dev") {
            for entry in entries.flatten() {
                if let Some(name) = entry.file_name().to_str() {
                    if serial_prefixes.iter().any(|p| name.starts_with(p))
                        && name.chars().any(|c| c.is_ascii_digit())
                    {
                        let path = entry.path().to_string_lossy().to_string();
                        if std::fs::OpenOptions::new()
                            .read(true)
                            .write(true)
                            .open(&path)
                            .is_ok()
                        {
                            ports.push(PortInfo {
                                name: name.to_string(),
                                path,
                            });
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
                            ports.push(PortInfo {
                                name: format!("pts/{}", name),
                                path,
                            });
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        for i in 1..=256 {
            let path = format!("\\\\.\\COM{}", i);
            if std::fs::OpenOptions::new()
                .read(true)
                .write(true)
                .open(&path)
                .is_ok()
            {
                ports.push(PortInfo {
                    name: format!("COM{}", i),
                    path,
                });
            }
        }
    }

    #[cfg(target_os = "linux")]
    fn port_priority(name: &str) -> u8 {
        if name.starts_with("ttyACM") {
            0
        } else if name.starts_with("ttyUSB") {
            1
        } else {
            2
        }
    }

    #[cfg(target_os = "windows")]
    fn port_priority(_name: &str) -> u8 {
        0
    }

    ports.sort_by(|a, b| {
        port_priority(&a.name)
            .cmp(&port_priority(&b.name))
            .then(a.name.cmp(&b.name))
    });
    ports
}