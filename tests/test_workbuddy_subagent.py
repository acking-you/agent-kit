import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "skills/workbuddy-subagent/scripts/workbuddy.py"
spec = importlib.util.spec_from_file_location("workbuddy", SCRIPT)
wb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wb)


class WorkBuddyTests(unittest.TestCase):
    def test_flagship_tier_beats_minor_version(self):
        self.assertEqual(wb.select_model(["gpt-6-astra", "gpt-6.1-sol", "gpt-6-luna"], "gpt"), "gpt-6-astra")

    def test_newer_version_within_opus_family(self):
        self.assertEqual(wb.select_model(["claude-opus-5", "claude-opus-5.5", "claude-sonnet-6"], "claude"), "claude-opus-5.5")

    def test_future_numeric_version(self):
        self.assertEqual(wb.select_model(["gpt-6-astra", "gpt-10-astra"], "gpt"), "gpt-10-astra")

    def test_exact_model_override(self):
        self.assertEqual(wb.select_model(["gpt-6-astra", "claude-opus-5.5"], "claude-opus-5.5"), "claude-opus-5.5")

    def test_no_silent_downgrade(self):
        with self.assertRaises(wb.WorkBuddyError):
            wb.select_model(["auto", "gpt-6.1-sol", "claude-opus-5.5"], "gpt")

    def test_missing_explicit_model_fails(self):
        with self.assertRaises(wb.WorkBuddyError):
            wb.select_model(["claude-opus-5.5"], "claude-opus-5-5")

    def result(self, **changes):
        value = dict(type="result", subtype="success", is_error=False, result="Verified answer", session_id="test")
        value.update(changes)
        return wb.checked_result("Boot log\n" + json.dumps(value, indent=2))

    def test_completed_result(self):
        value, ok = self.result()
        self.assertTrue(ok)
        self.assertEqual(value["session_id"], "test")

    def test_auth_error_is_failure(self):
        _, ok = self.result(subtype="error_during_execution", is_error=True, errors=["Authentication required"])
        self.assertFalse(ok)

    def test_hidden_acp_error_is_failure(self):
        _, ok = self.result(_meta={"codebuddy.ai/errorMessage": "401 Unauthorized"})
        self.assertFalse(ok)

    def test_empty_success_is_not_completion(self):
        self.assertFalse(self.result(result="")[1])

    def test_permission_denial_is_not_completion(self):
        self.assertFalse(self.result(permission_denials=[{"tool_name": "Edit"}])[1])

    def test_turn_limit_is_not_completion(self):
        self.assertFalse(self.result(subtype="error_max_turns")[1])

    def test_partial_stream_is_pending(self):
        with self.assertRaises(wb.WorkBuddyError):
            wb.checked_result('{"type":"assistant","message":"Working"}\n')

    def test_output_collision_prevents_launch(self):
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "existing.jsonl"
            log.write_text("keep")
            with self.assertRaises(FileExistsError):
                wb.run_task(["/nonexistent/should-never-run"], {}, tmp, [], str(log), 1)
            self.assertEqual(log.read_text(), "keep")


if __name__ == "__main__":
    unittest.main()
