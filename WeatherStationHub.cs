using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace WeatherStationHubApp
{
    static class Program
    {
        private static void OpenDashboard()
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "http://localhost:3000",
                    UseShellExecute = true
                });
            }
            catch (Exception)
            {
                try
                {
                    Process.Start("cmd.exe", "/c start http://localhost:3000");
                }
                catch (Exception) {}
            }
        }

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string bundledNode = Path.Combine(appDir, "node.exe");
            
            ProcessStartInfo startInfo = new ProcessStartInfo();
            startInfo.WorkingDirectory = appDir;
            startInfo.CreateNoWindow = true;
            startInfo.UseShellExecute = false;

            if (File.Exists(bundledNode))
            {
                startInfo.FileName = bundledNode;
                startInfo.Arguments = "server.js";
            }
            else
            {
                startInfo.FileName = "node";
                startInfo.Arguments = "server.js";
            }

            Process nodeProcess = null;
            try
            {
                nodeProcess = Process.Start(startInfo);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Failed to launch Weather Station Hub server process.\n\nError: " + ex.Message + "\n\nPlease ensure Node.js is installed on this PC or node.exe is included in the application folder.", "Weather Station Hub Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            // Wait 2 seconds for server startup
            Thread.Sleep(2000);

            // Check if process crashed immediately
            if (nodeProcess != null && nodeProcess.HasExited)
            {
                MessageBox.Show("The Weather Station server started but exited unexpectedly.\n\nPlease run 'Open_Firewall_Port_3000.bat' or verify Node.js installation.", "Server Startup Notice", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }

            // Launch Dashboard in Default Browser
            OpenDashboard();

            // Create System Tray Notification Icon
            NotifyIcon trayIcon = new NotifyIcon();
            trayIcon.Text = "Weather Station Hub";
            try
            {
                string iconPath = Path.Combine(appDir, "public", "favicon.ico");
                if (File.Exists(iconPath))
                {
                    trayIcon.Icon = new System.Drawing.Icon(iconPath);
                }
                else
                {
                    trayIcon.Icon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                }
            }
            catch
            {
                trayIcon.Icon = System.Drawing.SystemIcons.Application;
            }
            trayIcon.Visible = true;

            bool isExiting = false;
            Action killServerTree = () => {
                if (isExiting) return;
                isExiting = true;

                try {
                    if (trayIcon != null) {
                        trayIcon.Visible = false;
                        trayIcon.Dispose();
                    }
                } catch {}

                try {
                    if (nodeProcess != null && !nodeProcess.HasExited) {
                        int pid = nodeProcess.Id;
                        ProcessStartInfo killInfo = new ProcessStartInfo("taskkill.exe", "/F /T /PID " + pid);
                        killInfo.CreateNoWindow = true;
                        killInfo.UseShellExecute = false;
                        Process kp = Process.Start(killInfo);
                        if (kp != null) kp.WaitForExit(3000);

                        if (!nodeProcess.HasExited) {
                            nodeProcess.Kill();
                        }
                    }
                } catch {}

                // Fallback: Kill any node.exe process running server.js in appDir
                try {
                    foreach (var proc in Process.GetProcessesByName("node")) {
                        try {
                            if (proc.MainModule != null && proc.MainModule.FileName.StartsWith(appDir, StringComparison.OrdinalIgnoreCase)) {
                                proc.Kill();
                            }
                        } catch {}
                    }
                } catch {}

                Application.Exit();
            };

            // Monitor nodeProcess exit event
            if (nodeProcess != null) {
                nodeProcess.EnableRaisingEvents = true;
                nodeProcess.Exited += (s, e) => {
                    killServerTree();
                };
            }

            // Periodic watchdog timer to automatically close tray app if server process shuts down from Web UI
            System.Windows.Forms.Timer exitWatchdog = new System.Windows.Forms.Timer();
            exitWatchdog.Interval = 1500;
            exitWatchdog.Tick += (s, e) => {
                if (nodeProcess != null && nodeProcess.HasExited) {
                    killServerTree();
                }
            };
            exitWatchdog.Start();

            ContextMenu menu = new ContextMenu();
            menu.MenuItems.Add("Open Dashboard (http://localhost:3000)", (s, e) => {
                OpenDashboard();
            });
            menu.MenuItems.Add("-");
            menu.MenuItems.Add("Exit Weather Station Hub", (s, e) => {
                killServerTree();
            });

            trayIcon.ContextMenu = menu;
            trayIcon.DoubleClick += (s, e) => {
                OpenDashboard();
            };

            Application.ApplicationExit += (s, e) => {
                killServerTree();
            };

            // Keep App Running in System Tray
            Application.Run();

            // Final fallback cleanup
            killServerTree();
        }
    }
}
