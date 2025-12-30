# User-Centric UX Assumptions

## Target User Journey

A developer visits our website on any device (laptop/phone), creates or accesses a cloud workspace, and interacts with Claude Code via terminal.

---

## UX Assumptions to Validate

### A1: Sign-In Flow (Clerk)

- **Assumption**: User can sign in via Clerk (Google/GitHub) in under 30 seconds
- **Metric**: Time from landing to authenticated dashboard
- **Pass criteria**: < 30s, no errors, redirects correctly

### A2: Dashboard Load

- **Assumption**: Dashboard loads and shows workspaces immediately after sign-in
- **Metric**: Time to first contentful paint of workspace list
- **Pass criteria**: < 2s after auth redirect

### A3: Workspace Creation

- **Assumption**: User can create a new workspace with a custom name
- **Metric**: Click "New Workspace" → Fill name → Submit → Workspace appears
- **Pass criteria**: < 5s, clear feedback, workspace visible in list

### A4: Workspace Start

- **Assumption**: User clicks "Start" and sees real-time status updates
- **Metric**: Status badge updates as provisioning progresses
- **Pass criteria**: Status changes visible without manual refresh

### A5: Terminal Appears

- **Assumption**: Terminal automatically appears when workspace is running
- **Metric**: Terminal renders and connects without user action
- **Pass criteria**: Terminal visible within 5s of "running" status

### A6: Terminal Interactivity

- **Assumption**: User can type in terminal and see output
- **Metric**: Type `ls` → Press Enter → See directory listing
- **Pass criteria**: Input works, output displays, no lag > 100ms

### A7: Claude Code Works

- **Assumption**: User can run `claude` and interact with Claude Code
- **Metric**: Type `claude` → See welcome screen → Navigate prompts
- **Pass criteria**: Claude Code starts, accepts input, responds

### A8: Mobile Access

- **Assumption**: Same experience works on phone browser
- **Metric**: All above criteria on mobile viewport (375x812)
- **Pass criteria**: Responsive layout, terminal usable

---

## Known Issues to Fix

1. **Terminal protocol mismatch**: XTerminal wasn't speaking ttyd's binary protocol ✅ FIXED
2. **Status polling**: Page doesn't poll after "Start" - requires manual refresh ✅ FIXED (WorkspaceStatusPoller)
3. **Session token auth**: Terminal API may not be receiving Clerk auth properly ✅ FIXED
4. **WebSocket subprotocol**: Control-plane relay wasn't using "tty" subprotocol ✅ FIXED
5. **Initial resize**: No resize message sent on WebSocket open ✅ FIXED

---

## Test Results (2025-12-30)

| Assumption | Status | Notes                                                                     |
| ---------- | ------ | ------------------------------------------------------------------------- |
| A1         | ✅     | Clerk sign-in/up pages load correctly, OAuth buttons work, redirects work |
| A2         | ✅     | Dashboard loads after auth, workspace list renders                        |
| A3         | ✅     | New workspace form works, creates workspace successfully                  |
| A4         | ✅     | Status polling added - auto-refreshes during provisioning                 |
| A5         | ⏳     | Terminal component mounts, needs E2E browser test                         |
| A6         | ⏳     | ttyd works in direct browser access, relay fixed - needs E2E test         |
| A7         | ⏳     | Claude Code runs on VM (confirmed in browser), OAuth flow shown           |
| A8         | ⏳     | Not tested yet                                                            |

## Technical Fixes Applied

### 1. XTerminal.tsx - ttyd Binary Protocol

- Input: byte 0 ('0') + data
- Resize: byte 1 ('1') + JSON `{"columns":X,"rows":Y}`
- Output parsing: first byte is message type

### 2. Terminal.tsx - Clerk Authentication

- Added `useAuth()` from Clerk
- Token passed in Authorization header for session API

### 3. WorkspaceStatusPoller.tsx - Auto-refresh

- Polls every 3 seconds during transitional states
- States: pending, provisioning, starting, stopping

### 4. control-plane/terminal.ts - WebSocket Relay

- Added "tty" subprotocol for ttyd connection
- Debug logging for troubleshooting

### 5. XTerminal.tsx - Initial Resize

- Send resize message immediately on WebSocket open
- Ensures ttyd knows terminal dimensions
