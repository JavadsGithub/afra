use crate::infrastructure::port_scanner::PortInfo;

pub struct PortScanUseCase;

impl PortScanUseCase {
    pub fn new() -> Self {
        Self
    }

    pub fn scan_ports(&self) -> Vec<PortInfo> {
        crate::infrastructure::port_scanner::scan_ports()
    }
}
