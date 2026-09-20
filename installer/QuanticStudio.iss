#ifndef MyAppVersion
  #define MyAppVersion "2.7.4"
#endif
#ifndef SourceDir
  #define SourceDir "..\dist\QuanticStudio"
#endif

[Setup]
AppId=AuraLive.XDSawyerLoL
AppName=Quantic Studio
AppVersion={#MyAppVersion}
AppPublisher=Quantic Sillage
AppPublisherURL=https://github.com/XDSawyerLoL/Auralive
AppSupportURL=https://github.com/XDSawyerLoL/Auralive/issues
AppUpdatesURL=https://github.com/XDSawyerLoL/Auralive/releases/latest
DefaultDirName={localappdata}\Programs\Aura Live
DefaultGroupName=Quantic Studio
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\release
OutputBaseFilename=QuanticStudio-Setup-{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=yes
SetupLogging=yes
UninstallDisplayIcon={app}\QuanticStudio.exe
VersionInfoVersion={#MyAppVersion}.0
VersionInfoProductName=Quantic Studio
VersionInfoProductVersion={#MyAppVersion}
VersionInfoCompany=Quantic Sillage
VersionInfoDescription=Quantic Studio Native Broadcast Suite
VersionInfoCopyright=Quantic Sillage

SetupIconFile=..\build-assets\quantic-studio.ico

[Tasks]
Name: "desktopicon"; Description: "Créer un raccourci sur le Bureau"; GroupDescription: "Raccourcis"; Flags: unchecked

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: ".env,data\*,QuanticStudio-startup.log"
Source: "{#SourceDir}\.env"; DestDir: "{app}"; Flags: onlyifdoesntexist uninsneveruninstall
Source: "{#SourceDir}\data\voices\kokoro\*"; DestDir: "{app}\data\voices\kokoro"; Flags: ignoreversion recursesubdirs createallsubdirs

[Dirs]
Name: "{app}\data"; Flags: uninsneveruninstall
Name: "{app}\data\media"; Flags: uninsneveruninstall
Name: "{app}\data\native_broadcast"; Flags: uninsneveruninstall

[Icons]
Name: "{group}\Quantic Studio"; Filename: "{app}\QuanticStudio.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\Quantic Studio"; Filename: "{app}\QuanticStudio.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\QuanticStudio.exe"; Description: "Lancer Quantic Studio"; WorkingDir: "{app}"; Flags: nowait postinstall