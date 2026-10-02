using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

namespace WeatherStationHubApp
{
    static class Program
    {
        private static string appDataDir;
        private static string serverUrl = "http://localhost:3000";

        private static void OpenDashboard()
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = serverUrl,
                    UseShellExecute = true
                });
            }
            catch (Exception)
            {
                try
                {
                    Process.Start("cmd.exe", "/c start " + serverUrl);
                }
                catch (Exception) {}
            }
        }

        private static void ExtractPayloadIfRequired(string targetDir)
        {
            if (!Directory.Exists(targetDir))
            {
                Directory.CreateDirectory(targetDir);
            }

            Assembly asm = Assembly.GetExecutingAssembly();
            string resourceName = null;

            foreach (string name in asm.GetManifestResourceNames())
            {
                if (name.EndsWith("payload.zip", StringComparison.OrdinalIgnoreCase))
                {
                    resourceName = name;
                    break;
                }
            }

            if (string.IsNullOrEmpty(resourceName))
            {
                throw new Exception("Embedded payload resource (payload.zip) not found in executable assembly.");
            }

            string buildStamp = "";
            using (Stream resStream = asm.GetManifestResourceStream(resourceName))
            {
                if (resStream != null) buildStamp = resStream.Length.ToString();
            }

            string versionFile = Path.Combine(targetDir, "_payload_version.txt");
            if (File.Exists(versionFile) && File.Exists(Path.Combine(targetDir, "server.js")))
            {
                try
                {
                    string existingStamp = File.ReadAllText(versionFile).Trim();
                    if (existingStamp == buildStamp)
                    {
                        // Payload is up to date
                        return;
                    }
                }
                catch {}
            }

            string tempZipPath = Path.Combine(targetDir, "_payload_temp.zip");
            using (Stream resStream = asm.GetManifestResourceStream(resourceName))
            using (FileStream fs = new FileStream(tempZipPath, FileMode.Create, FileAccess.Write))
            {
                resStream.CopyTo(fs);
            }

            using (ZipArchive archive = ZipFile.OpenRead(tempZipPath))
            {
                foreach (ZipArchiveEntry entry in archive.Entries)
                {
                    if (string.IsNullOrEmpty(entry.Name) && entry.FullName.EndsWith("/"))
                    {
                        string dirPath = Path.Combine(targetDir, entry.FullName);
                        if (!Directory.Exists(dirPath)) Directory.CreateDirectory(dirPath);
                        continue;
                    }

                    string destinationPath = Path.Combine(targetDir, entry.FullName);
                    string destDir = Path.GetDirectoryName(destinationPath);
                    if (!Directory.Exists(destDir)) Directory.CreateDirectory(destDir);

                    // Preserve existing weather_history.json
                    if (entry.Name.Equals("weather_history.json", StringComparison.OrdinalIgnoreCase) && File.Exists(destinationPath))
                    {
                        continue;
                    }

                    entry.ExtractToFile(destinationPath, true);
                }
            }

            try
            {
                File.WriteAllText(versionFile, buildStamp);
                if (File.Exists(tempZipPath)) File.Delete(tempZipPath);
            }
            catch {}
        }

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            appDataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "WeatherStationHubPortable");

            try
            {
                ExtractPayloadIfRequired(appDataDir);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Failed to extract Weather Station Hub portable payload.\n\nError: " + ex.Message, "Portable Weather Station Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            string bundledNode = Path.Combine(appDataDir, "node.exe");
            string serverScript = Path.Combine(appDataDir, "server.js");

            ProcessStartInfo startInfo = new ProcessStartInfo();
            startInfo.WorkingDirectory = appDataDir;
            startInfo.CreateNoWindow = true;
            startInfo.UseShellExecute = false;

            if (File.Exists(bundledNode))
            {
                startInfo.FileName = bundledNode;
                startInfo.Arguments = "\"" + serverScript + "\"";
            }
            else
            {
                startInfo.FileName = "node";
                startInfo.Arguments = "\"" + serverScript + "\"";
            }

            Process nodeProcess = null;
            try
            {
                nodeProcess = Process.Start(startInfo);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Failed to launch Weather Station server process.\n\nError: " + ex.Message, "Weather Station Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            // Wait 2 seconds for server startup
            Thread.Sleep(2000);

            // Check if process crashed immediately
            if (nodeProcess != null && nodeProcess.HasExited)
            {
                MessageBox.Show("The Weather Station server started but exited unexpectedly.", "Server Startup Notice", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }

            // Launch Dashboard in Default Browser
            OpenDashboard();

            // Create System Tray Notification Icon
            NotifyIcon trayIcon = new NotifyIcon();
            trayIcon.Text = "Weather Station Hub (Portable)";
            try
            {
                string iconPath = Path.Combine(appDataDir, "public", "favicon.ico");
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

                try {
                    foreach (var proc in Process.GetProcessesByName("node")) {
                        try {
                            if (proc.MainModule != null && proc.MainModule.FileName.StartsWith(appDataDir, StringComparison.OrdinalIgnoreCase)) {
                                proc.Kill();
                            }
                        } catch {}
                    }
                } catch {}

                Application.Exit();
            };

            if (nodeProcess != null) {
                nodeProcess.EnableRaisingEvents = true;
                nodeProcess.Exited += (s, e) => {
                    killServerTree();
                };
            }

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

            Application.Run();
            killServerTree();
        }
    }
}
