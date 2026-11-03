use dirs;
use std::path::PathBuf;

#[cfg(unix)]
fn set_perms(path: &std::path::Path, mode: u32) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode))
        .map_err(|e| format!("Failed to set permissions on {:?}: {}", path, e))
}

// Get the application data directory path
pub fn get_data_dir() -> Result<PathBuf, String> {
    match dirs::data_dir() {
        Some(mut path) => {
            path.push("RemoteControlApp");
            if !path.exists() {
                std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
            }
            #[cfg(unix)]
            {
                let _ = set_perms(&path, 0o755);
            }
            Ok(path)
        }
        None => Err("Failed to get data directory".to_string()),
    }
}

/// Write content to a file and set world-readable/writable permissions (0o666).
/// This ensures the file remains accessible even if created during an
/// elevated (root) session.
pub fn write_file(path: &std::path::Path, content: &str) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};
        // If the file exists and is owned by root, try to change permissions
        if path.exists() {
            let meta =
                std::fs::metadata(path).map_err(|e| format!("Failed to get metadata: {}", e))?;
            let uid = meta.uid();
            if uid == 0 {
                // File is owned by root, try to make it writable by others
                let mode = meta.permissions().mode();
                let desired = (mode & 0o111) | 0o666;
                if mode != desired {
                    let _ = set_perms(path, desired);
                }
            }
        }
    }
    std::fs::write(path, content).map_err(|e| format!("Failed to write {:?}: {}", path, e))?;
    #[cfg(unix)]
    {
        let _ = set_perms(path, 0o666);
    }
    Ok(())
}
