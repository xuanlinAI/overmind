#![windows_subsystem = "windows"]

use std::process::Command;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() { std::process::exit(1); }
    let program = &args[0];
    let rest = &args[1..];

    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    const DETACHED_PROCESS: u32 = 0x00000008;
    const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x01000000;

    let _ = Command::new(program)
        .args(rest)
        .creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS | CREATE_BREAKAWAY_FROM_JOB)
        .spawn();
}
