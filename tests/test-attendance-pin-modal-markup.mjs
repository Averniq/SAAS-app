import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const modal = html.match(/<div class="modal-backdrop hidden" id="attendancePinModal"[\s\S]*?<\/div>\s*<div class="modal-backdrop hidden" id="attendanceReportDetailModal"/);

assert.ok(modal, "attendance PIN modal markup must be present");
assert.match(modal[0], /<section class="attendance-pin-modal">[\s\S]*?<form class="auth-form" id="attendancePinForm"/);
assert.doesNotMatch(modal[0], /id="closeAttendancePin"[\s\S]*?<\/div>\s*<\/div>\s*<form class="auth-form"/);
console.log("Attendance PIN form is contained within its hidden modal.");
