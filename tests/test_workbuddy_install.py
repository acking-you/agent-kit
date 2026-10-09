from pathlib import Path
import subprocess
import tempfile
import unittest

REPO=Path(__file__).resolve().parents[1]


class InstallerTests(unittest.TestCase):
    def test_local_consent_survives_update_and_is_never_imported(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source=root/'source';destination=root/'destination'
            skill=source/'workbuddy-subagent';skill.mkdir(parents=True)
            (skill/'SKILL.md').write_text('Version 1')
            (skill/'user-config.json').write_text('{"native_bootstrap_consent":true}')
            command=['bash','-c','source "$1"; SKILLS_DIR="$2"; GLOBAL_CLAUDE_DIR="$3"; GLOBAL_SKILLS_DIR="$3/skills"; install_skill workbuddy-subagent','test',str(REPO/'install.sh'),str(source),str(destination)]
            def install(): subprocess.run(command,check=True,capture_output=True,text=True)
            install()
            target=destination/'skills/workbuddy-subagent'
            consent=target/'user-config.json'
            self.assertFalse(consent.exists())
            personal=b'{"native_bootstrap_consent":false,"personal":"keep"}\n'
            consent.write_bytes(personal);consent.chmod(0o600)
            (target/'obsolete.txt').write_text('Old packaged file')
            (skill/'SKILL.md').write_text('Version 2')
            install()
            self.assertEqual(consent.read_bytes(),personal)
            self.assertEqual(consent.stat().st_mode & 0o777,0o600)
            self.assertEqual((target/'SKILL.md').read_text(),'Version 2')
            self.assertFalse((target/'obsolete.txt').exists())
