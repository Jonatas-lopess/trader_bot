# 05: End-to-end verification and setup checklist

**What to build:** prove the whole gallery works in a real browser against the built app, and leave the manual setup written down.

- Admin: create a Robô, add images and a video, caption, reorder, remove, rename the slug; each action also with JavaScript off.
- Public: publish the Robô, open its modal on `/catalog` anonymously; unpublish and archive it and confirm the media URLs 404 for anonymous callers.
- Limits: an oversize file and a wrong-type file are refused end to end with readable messages.
- Setup checklist for the human: create the media bucket (dashboard or Wrangler), add the binding to `wrangler.jsonc` and to the CI environments as was done for the robot-binary bucket, deploy. Flag that the code cannot do this.
- Confirm no CSP or framing header blocks the media route or the YouTube embed on the deployed site.

**Blocked by:** 01, 02, 03, 04.

**Status:** ready-for-agent

- [ ] Admin flow walked in the browser, with and without JavaScript
- [ ] Public modal checked on desktop and phone width
- [ ] Unpublished and archived Robôs expose none of their media to anonymous callers
- [ ] Refusal messages read correctly for oversize and wrong-type files
- [ ] Setup checklist for the media bucket and CI bindings written in the ticket's Comments
- [ ] Typecheck and the full test suite pass
