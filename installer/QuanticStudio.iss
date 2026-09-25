#ifndef MyAppVersion
  #define MyAppVersion "2.8.1"
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
DefaultDirName={localappdata}\Programs\Quantic Studio
UsePreviousAppDir=no
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

[InstallDelete]
Type: files; Name: "{autodesktop}\Aura Live.lnk"
Type: filesandordirs; Name: "{autoprograms}\Aura Live"

[Run]
Filename: "{app}\QuanticStudio.exe"; Description: "Lancer Quantic Studio"; WorkingDir: "{app}"; Flags: nowait postinstall

[Code]
const
  LegacyInstallDirName = 'Aura Live';

procedure CopyTreeIfMissing(const SourceDir, DestDir: string);
var
  FindRec: TFindRec;
  SourcePath: string;
  DestPath: string;
begin
  if not DirExists(SourceDir) then
    Exit;

  ForceDirectories(DestDir);

  if FindFirst(AddBackslash(SourceDir) + '*', FindRec) then
  begin
    try
      repeat
        if (FindRec.Name <> '.') and (FindRec.Name <> '..') then
        begin
          SourcePath := AddBackslash(SourceDir) + FindRec.Name;
          DestPath := AddBackslash(DestDir) + FindRec.Name;

          if (FindRec.Attributes and FILE_ATTRIBUTE_DIRECTORY) <> 0 then
            CopyTreeIfMissing(SourcePath, DestPath)
          else if not FileExists(DestPath) then
            FileCopy(SourcePath, DestPath, False);
        end;
      until not FindNext(FindRec);
    finally
      FindClose(FindRec);
    end;
  end;
end;

procedure MigrateLegacyAuraLiveData;
var
  LegacyDir: string;
  NewDir: string;
begin
  LegacyDir := ExpandConstant('{localappdata}\Programs\') + LegacyInstallDirName;
  NewDir := ExpandConstant('{app}');

  if (CompareText(LegacyDir, NewDir) = 0) or not DirExists(LegacyDir) then
    Exit;

  ForceDirectories(NewDir);

  if FileExists(AddBackslash(LegacyDir) + '.env') and
     not FileExists(AddBackslash(NewDir) + '.env') then
    FileCopy(AddBackslash(LegacyDir) + '.env', AddBackslash(NewDir) + '.env', False);

  CopyTreeIfMissing(
    AddBackslash(LegacyDir) + 'data',
    AddBackslash(NewDir) + 'data'
  );
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  LegacyDir: string;
begin
  if CurStep = ssInstall then
    MigrateLegacyAuraLiveData;

  if CurStep = ssPostInstall then
  begin
    LegacyDir := ExpandConstant('{localappdata}\Programs\') + LegacyInstallDirName;
    if (CompareText(LegacyDir, ExpandConstant('{app}')) <> 0) and
       FileExists(ExpandConstant('{app}\QuanticStudio.exe')) and
       DirExists(LegacyDir) then
      DelTree(LegacyDir, True, True, True);
  end;
end;
