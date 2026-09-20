#ifndef MyAppVersion
  #define MyAppVersion "2.7.2"
#endif
#ifndef SourceDir
  #define SourceDir "..\\dist\\AuraLive"
#endif

[Setup]
AppId=AuraLive.XDSawyerLoL
AppName=Aura Live
AppVersion={#MyAppVersion}
AppPublisher=Quantic Sillage
AppPublisherURL=https://github.com/XDSawyerLoL/Auralive
AppSupportURL=https://github.com/XDSawyerLoL/Auralive/issues
AppUpdatesURL=https://github.com/XDSawyerLoL/Auralive/releases/latest
DefaultDirName={localappdata}\\Programs\\Aura Live
DefaultGroupName=Aura Live
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\\release
OutputBaseFilename=AuraLive-Setup-{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
CloseApplications=force
RestartApplications=yes
SetupLogging=yes
UninstallDisplayIcon={app}\\AuraLive.exe
VersionInfoVersion={#MyAppVersion}.0
VersionInfoProductName=Aura Live
VersionInfoProductVersion={#MyAppVersion}
VersionInfoCompany=Quantic Sillage
VersionInfoDescription=Aura Live Native Streaming Suite
VersionInfoCopyright=Quantic Sillage

[Tasks]
Name: "desktopicon"; Description: "Créer un raccourci sur le Bureau"; GroupDescription: "Raccourcis"; Flags: unchecked

[Files]
Source: "{#SourceDir}\\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: ".env,data\\*,AuraLive-startup.log"
Source: "{#SourceDir}\\.env"; DestDir: "{app}"; Flags: onlyifdoesntexist uninsneveruninstall
Source: "{#SourceDir}\\data\\voices\\kokoro\\*"; DestDir: "{app}\\data\\voices\\kokoro"; Flags: ignoreversion recursesubdirs createallsubdirs

[Dirs]
Name: "{app}\\data"; Flags: uninsneveruninstall
Name: "{app}\\data\\media"; Flags: uninsneveruninstall
Name: "{app}\\data\\native_broadcast"; Flags: uninsneveruninstall

[Icons]
Name: "{group}\\Aura Live"; Filename: "{app}\\AuraLive.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\\Aura Live"; Filename: "{app}\\AuraLive.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\\AuraLive.exe"; Description: "Lancer Aura Live"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent