use crate::domain::entities::telemetry::Telemetry;
use std::path::Path;

pub const HEADERS: [&str; 14] = [
    "timestamp",
    "latitude",
    "longitude",
    "yaw",
    "depth",
    "rps",
    "ampere",
    "wtd",
    "temperature",
    "speed",
    "battery_level",
    "mission_id",
    "status",
    "error",
];

fn telemetry_values(t: &Telemetry) -> [f64; 14] {
    [
        t.timestamp,
        t.latitude,
        t.longitude,
        t.yaw,
        t.depth,
        t.rps,
        t.ampere,
        t.wtd,
        t.temperature,
        t.speed,
        t.battery_level,
        t.mission_id,
        t.status,
        t.error,
    ]
}

/// CSV with RFC 4180 (CRLF) line endings so it opens correctly in Excel on
/// both Windows and Linux.
pub fn to_csv(telemetries: &[Telemetry]) -> String {
    let mut csv = String::from(HEADERS.join(","));
    csv.push_str("\r\n");
    for t in telemetries {
        let line = telemetry_values(t)
            .iter()
            .map(|v| v.to_string())
            .collect::<Vec<_>>()
            .join(",");
        csv.push_str(&line);
        csv.push_str("\r\n");
    }
    csv
}

pub fn to_json(telemetries: &[Telemetry]) -> Result<String, String> {
    serde_json::to_string_pretty(telemetries).map_err(|e| e.to_string())
}

/// Native Excel (.xlsx) workbook with a bold header row.
pub fn write_xlsx(telemetries: &[Telemetry], path: &Path) -> Result<(), String> {
    use rust_xlsxwriter::{Format, Workbook};

    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();
    let header_format = Format::new().set_bold();

    for (col, header) in HEADERS.iter().enumerate() {
        worksheet
            .write_string_with_format(0, col as u16, *header, &header_format)
            .map_err(|e| e.to_string())?;
    }

    for (row, t) in telemetries.iter().enumerate() {
        for (col, value) in telemetry_values(t).iter().enumerate() {
            worksheet
                .write_number((row + 1) as u32, col as u16, *value)
                .map_err(|e| e.to_string())?;
        }
    }

    for col in 0..HEADERS.len() {
        worksheet
            .set_column_width(col as u16, 16.0)
            .map_err(|e| e.to_string())?;
    }

    workbook.save(path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Vec<Telemetry> {
        vec![
            Telemetry::new(
                35.6892,
                51.3890,
                90.0,
                12.5,
                3.0,
                4.2,
                1.1,
                300.0,
                1_700_000_000.0,
                2.4,
                87.0,
                1.0,
                0.0,
                0.0,
            ),
            Telemetry::new(
                35.6893,
                51.3891,
                91.0,
                13.0,
                3.1,
                4.3,
                1.2,
                310.0,
                1_700_000_001.0,
                2.5,
                86.0,
                1.0,
                1.0,
                0.0,
            ),
        ]
    }

    #[test]
    fn csv_has_crlf_and_header() {
        let csv = to_csv(&sample());
        assert!(csv.starts_with("timestamp,latitude,longitude"));
        assert!(csv.contains("\r\n"));
        assert_eq!(csv.matches("\r\n").count(), 3);
    }

    #[test]
    fn xlsx_is_a_valid_zip_container() {
        let dir = std::env::temp_dir();
        let path = dir.join("sepehr_export_test.xlsx");
        write_xlsx(&sample(), &path).unwrap();
        let bytes = std::fs::read(&path).unwrap();
        assert_eq!(&bytes[..4], b"PK\x03\x04");
        let _ = std::fs::remove_file(&path);
    }
}
