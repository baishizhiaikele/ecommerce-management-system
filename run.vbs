Set WshShell = CreateObject("WScript.Shell")
baseDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\") - 1)
batPath = baseDir & "\start.bat"
' cmd /k 直接运行带引号的 start.bat（不用 call，call 在 wscript 命令解析下会破坏整条命令）。
' cmd /k 保证主窗口常驻，避免 wscript 管道 stdin 下 timeout/pause 导致窗口一闪而过。
WshShell.Run "cmd.exe /k " & Chr(34) & batPath & Chr(34), 1, False
