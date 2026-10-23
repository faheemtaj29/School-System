; ============================================================
;  EduCore School System — Inno Setup Installer Script
;  Build with: Inno Setup 6+ from https://jrsoftware.org
;
;  Before building:
;    1. npm run build   (creates .next folder)
;    2. Open this file in Inno Setup Compiler
;    3. Build → Compile
;  Output: setup/Output/EduCore-Setup.exe  (~150 MB)
;
;  The installer bundles Node.js LTS and the built app.
;  MongoDB is downloaded via winget during setup.
; ============================================================

#define AppName      "EduCore School System"
#define AppVersion   "1.0.0"
#define BuildDate    "2026-10-23"
#define AppPublisher "Your School"
#define AppURL       "http://localhost:3000"
#define AppExeName   "EduCore"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion} (Build {#BuildDate})
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
DefaultDirName=C:\EduCore
DefaultGroupName={#AppName}
AllowNoIcons=yes
LicenseFile=..\LICENSE
OutputDir=Output
OutputBaseFilename=EduCore-Setup
SetupIconFile=..\public\favicon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog
ShowLanguageDialog=no
LanguageDetectionMethod=none
UninstallDisplayIcon={app}\setup\EduCore.ico
CloseApplications=yes
RestartApplications=no
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon";    Description: "Create a &desktop shortcut";   GroupDescription: "Additional icons:"; Flags: unchecked
Name: "startupservice"; Description: "Start automatically on &boot (Windows Service)"; GroupDescription: "Service:"; Flags: checkedonce
Name: "firewallrule";   Description: "Allow &LAN access (open port 3000 in Windows Firewall)"; GroupDescription: "Network:"; Flags: checkedonce

[Files]
; App source files (without large/excluded dirs)
Source: "..\*.json";          DestDir: "{app}";         Flags: ignoreversion
Source: "..\*.ts";            DestDir: "{app}";         Flags: ignoreversion
Source: "..\*.mjs";           DestDir: "{app}";         Flags: ignoreversion
Source: "..\*.config.*";      DestDir: "{app}";         Flags: ignoreversion
Source: "..\src\*";           DestDir: "{app}\src";     Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\public\*";        DestDir: "{app}\public";  Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\scripts\*";       DestDir: "{app}\scripts"; Flags: ignoreversion recursesubdirs createallsubdirs; Check: DirExists(ExpandConstant('{src}') + '\..\scripts')

; Pre-built Next.js output (must run npm run build before compiling installer)
Source: "..\\.next\*";        DestDir: "{app}\.next";   Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "cache"

; node_modules (large — consider running npm ci on target instead)
Source: "..\node_modules\*";  DestDir: "{app}\node_modules"; Flags: ignoreversion recursesubdirs createallsubdirs

; Setup scripts
Source: ".\*";                DestDir: "{app}\setup";   Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "Output,*.exe"

; NSSM service manager (bundled — download from https://nssm.cc and place in setup\tools\)
Source: "tools\nssm.exe";     DestDir: "{app}\tools";   Flags: ignoreversion; Check: FileExists(ExpandConstant('{src}') + '\tools\nssm.exe')

; NSSM service manager (bundled)
Source: "tools\nssm.exe"; DestDir: "{app}\tools"; Flags: ignoreversion; Check: Is64BitInstallMode

[Dirs]
Name: "{app}\logs"
Name: "C:\data\db"

[Icons]
Name: "{group}\{#AppName}";           Filename: "{app}\setup\start.bat"; WorkingDir: "{app}"
Name: "{group}\Stop EduCore";         Filename: "{app}\setup\stop.bat";  WorkingDir: "{app}"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{commondesktop}\{#AppName}";   Filename: "{app}\setup\start.bat"; Tasks: desktopicon

[Run]
; Create .env.local
Filename: "{sys}\cmd.exe"; Parameters: "/c ""{app}\setup\create-env.bat"""; WorkingDir: "{app}"; Flags: runhidden; StatusMsg: "Configuring environment..."

; Install/start MongoDB service
Filename: "{app}\tools\nssm.exe"; Parameters: "install EduCoreDB ""{app}\tools\mongod.exe"" ""--dbpath C:\data\db --port 27017"""; Flags: runhidden; Tasks: startupservice; StatusMsg: "Creating database service..."
Filename: "{app}\tools\nssm.exe"; Parameters: "set EduCoreDB Start SERVICE_AUTO_START"; Flags: runhidden; Tasks: startupservice
Filename: "net"; Parameters: "start EduCoreDB"; Flags: runhidden; Tasks: startupservice; StatusMsg: "Starting database..."

; Install/start EduCore service
Filename: "{app}\tools\nssm.exe"; Parameters: "install EduCore node.exe ""{app}\node_modules\.bin\next start -H 0.0.0.0 -p 3000"""; Flags: runhidden; Tasks: startupservice; StatusMsg: "Creating web server service..."
Filename: "{app}\tools\nssm.exe"; Parameters: "set EduCore AppDirectory ""{app}"""; Flags: runhidden; Tasks: startupservice
Filename: "{app}\tools\nssm.exe"; Parameters: "set EduCore Start SERVICE_AUTO_START"; Flags: runhidden; Tasks: startupservice
Filename: "net"; Parameters: "start EduCore"; Flags: runhidden; Tasks: startupservice; StatusMsg: "Starting EduCore..."

; Firewall
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""EduCore School System"" dir=in action=allow protocol=TCP localport=3000"; Flags: runhidden; Tasks: firewallrule; StatusMsg: "Configuring firewall..."

; Open browser
Filename: "{#AppURL}"; Flags: shellexec; Description: "Open EduCore in browser"; StatusMsg: "Opening EduCore..."

[UninstallRun]
Filename: "net";           Parameters: "stop EduCore";              Flags: runhidden
Filename: "{app}\tools\nssm.exe"; Parameters: "remove EduCore confirm";      Flags: runhidden
Filename: "net";           Parameters: "stop EduCoreDB";            Flags: runhidden
Filename: "{app}\tools\nssm.exe"; Parameters: "remove EduCoreDB confirm";    Flags: runhidden
Filename: "netsh";         Parameters: "advfirewall firewall delete rule name=""EduCore School System"""; Flags: runhidden

[Code]
// Check if Node.js is available; prompt to install if not
function NodeAvailable(): Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec('node', '--version', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
  if not NodeAvailable then begin
    if MsgBox('Node.js is not installed. Click OK to install it via winget, then re-run this installer.'
              + #13 + 'Or click Cancel to exit.', mbConfirmation, MB_OKCANCEL) = IDOK then begin
      ShellExec('', 'winget', 'install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements', '', SW_SHOW, ewWaitUntilTerminated, 0);
    end;
    Result := NodeAvailable;
    if not Result then
      MsgBox('Node.js installation failed or was cancelled. Please install it manually from https://nodejs.org and re-run this installer.', mbError, MB_OK);
  end;
end;
