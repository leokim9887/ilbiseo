import assert from "node:assert/strict";
import {
  parseIcsToEvents,
  unfoldIcs,
  normalizeCalendarFeedUrl,
  looksLikeCalendarUrl,
} from "../src/lib/ics.ts";

const googleSample = unfoldIcs(`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
X-WR-CALNAME:Test Cal
BEGIN:VEVENT
DTSTART:20261005T100000Z
DTEND:20261005T110000Z
SUMMARY:Google Zulu Event
DESCRIPTION:desc line
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20261010
DTEND;VALUE=DATE:20261011
SUMMARY:All day
END:VEVENT
END:VCALENDAR`);

const events = parseIcsToEvents(googleSample);
assert.equal(events.length, 2);
assert.equal(events[0].title, "Google Zulu Event");
assert.equal(events[0].allDay, false);
assert.equal(events[1].allDay, true);
assert.equal(events[0].calendarName, "Test Cal");

assert(looksLikeCalendarUrl("https://calendar.google.com/calendar/ical/x/public/basic.ics"));
assert(
  normalizeCalendarFeedUrl("webcal://calendar.google.com/calendar/ical/x/public/basic.ics").startsWith(
    "https://",
  ),
);

try {
  parseIcsToEvents("https://calendar.google.com/calendar/ical/x/public/basic.ics");
  assert.fail("should not parse url as ics");
} catch (e) {
  assert.match(e.message, /ICS 내용이 아닙니다|URL/);
}

console.log("ics parser ok", events.map((e) => e.title));
