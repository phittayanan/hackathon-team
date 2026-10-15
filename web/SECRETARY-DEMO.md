# Secretary demo

Open http://localhost:5173/?script=off after starting the app with `npm start` in `web/`.
This disables the older shopping → training → flight storyboard timers for this demonstration.

The home has **สรุปวันนี้**, **อีเมล → งาน**, and **ทดสอบแจ้งเตือน**.
All secretary data is simulated at 13:15. No Gmail or Calendar credentials are used;
all state lives in the current page and resets on reload.

Suggested two-minute demonstration:

1. Open today's summary: tasks and three appointments.
2. Open email and tap to import two tasks. Repeating the import creates no duplicates.
3. Return home, open notification testing, select the meeting change and a 10-second delay.
4. The client requests 13:30, which conflicts with the 13:00–14:00 team meeting.
   The calendar overlap check runs in code; 14:30–15:00 is free.
5. Prepare the reply, edit it, then tap **ส่งข้อความทดสอบ**. Only this tap simulates
   sending and updates the sample appointment. Spoken approval does not send.
6. Return home and try deadline or ordinary-email notifications. Deadline alerts speak;
   ordinary mail only increases the summary count. Try snoozing one or five minutes.
7. Use **รีเซ็ตเดโม** inside the test dialog to clear timers, tasks and the simulated send.

Notifications wait while a scene is open, anyone speaks, the mic is held, the test dialog
is open, or a text field is focused. Simultaneous pending alerts are grouped. Each event
type can be triggered once per demo reset; acknowledging prevents repeat alerts.
Timing uses the page's timers, so keep the browser open for the demo.

Voice requests support today's summary, email tasks, preparing a draft and snoozing.
The existing ElevenLabs agent must be synced with `npm run agent:sync` when its tools or
prompt change. The offline keyword router also supports these requests.
