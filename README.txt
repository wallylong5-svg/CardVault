CARD VAULT SCANNER — VERSION 1

FILES
-----
index.html
css/style.css
js/app.js

WHAT THIS VERSION DOES
----------------------
- Responsive mobile-first interface.
- Scan screen opens immediately.
- Uses phone rear camera when browser permission is available.
- Falls back to the phone's native camera/file picker.
- Captures and previews the card image.
- Keeps bottom navigation fixed.
- Bottom menu includes Scan, Refresh, and My Collection.
- Collection screen is scaffolded for the database stage.
- Latest image is placed in localStorage as a temporary placeholder.

IMPORTANT FOR CAMERA TESTING
----------------------------
Browser camera access generally requires HTTPS or localhost.

Opening index.html directly as a file may cause getUserMedia() to fail.
The fallback camera input should still work on many mobile devices.

For desktop development:
- Dreamweaver Live Preview / local server is recommended.
- Or publish the test site to an HTTPS-enabled host.

NEXT DEVELOPMENT STAGE
----------------------
1. Add a small backend so eBay credentials never appear in browser JavaScript.
2. Send captured image to backend.
3. Authenticate with eBay OAuth.
4. Call eBay Browse API image search.
5. Display candidate matches.
6. Confirm card.
7. Run cleaned-up eBay listing search for price comps.
8. Save card/photo/value into collection database.

BOOTSTRAP
---------
Uses Bootstrap 5.3.8 via CDN.
