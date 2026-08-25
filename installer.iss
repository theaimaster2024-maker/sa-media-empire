; Micvo — Inno Setup installer script
; BUILD.bat ei file ta nije chaliye ney. Alada kore kichu korte hobe na.

#define AppName "Micvo"
#define AppVersion "1.0"
#define AppPublisher "Shakil Ahmed"
#define AppExeName "Micvo.exe"

[Setup]
AppId={{8F3C1D2A-9B4E-4A11-9C7D-6E2A5B8F3D71}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir=Output
OutputBaseFilename=MicvoSetup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
SetupIconFile=micvo.ico
UninstallDisplayIcon={app}\{#AppExeName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Desktop e icon toiri koro"; GroupDescription: "Additional shortcuts:"
Name: "startupicon"; Description: "PC chalu holei Micvo nije chalu hobe"; GroupDescription: "Startup:"

[Files]
Source: "dist\{#AppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "LICENSE"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"
Name: "{group}\Micvo bondho koro"; Filename: "{cmd}"; Parameters: "/c taskkill /F /IM {#AppExeName}"; IconFilename: "{app}\{#AppExeName}"
Name: "{group}\{#AppName} uninstall koro"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon
Name: "{userstartup}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: startupicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Micvo ekhon-i chalu koro"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{cmd}"; Parameters: "/c taskkill /F /IM {#AppExeName}"; Flags: runhidden; RunOnceId: "KillMicvo"
