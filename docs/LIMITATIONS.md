# What LarpCam can't do (yet, or ever) as a web app

LarpCam runs in the browser so that installing it is one link and two taps. That choice has costs, mostly on iPhone. The rule in the app is: **if the phone can't really do it, the control isn't shown.** This page is the honest list.

"Hidden" means the app checks at run time and leaves the control out when the browser doesn't offer the feature.

## Camera

| What | Status on iPhone Safari | What LarpCam does |
| --- | --- | --- |
| Full-sensor photos (12 / 48 MP) | Not available. A web page can only save frames from the live video. | Photos are saved at the video size the phone gives the page, typically about 2 to 3 megapixels (1440 × 1920). Fine for sharing; not for large prints. |
| RAW / ProRAW | Not available to any web page. | No RAW option is shown. Captures are high-quality JPEG. The untouched capture is always kept so edits never destroy it. |
| Manual shutter speed and ISO | Not available. | No "Pro" controls are shown. |
| Brightness (exposure) control | Sometimes reported by the browser. | Planned: shown only when reported. |
| Tap to focus | Not reliably available; Safari focuses by itself. | Not shown. |
| Ultra-wide (0.5×) and telephoto lenses | Depends on the iOS version, and the browser only tells us lens names in the phone's language. | The 0.5× and Tele chips appear only when a matching camera is found. On phones set to a language other than English they may not appear. The web can't tell 2×, 3× and 5× telephotos apart, so the chip says "Tele". |
| 2× | Always possible. | Uses the camera's own zoom when the browser exposes it (sharper), otherwise crops the 1× picture. |
| Flash for the photo | Not available. | No flash button. Where the browser allows it, a **Light** switch keeps the phone's light on while you shoot. Hidden otherwise. |
| Photos while holding the phone sideways | A web page can't lock itself upright or learn which way the phone is held without the motion permission. | For now LarpCam is an upright camera: if the page turns sideways it asks you to turn the phone back. With rotation lock on, a sideways shot is saved turned on its side. Proper sideways photos are planned along with guidance. |
| Shutter with the volume buttons | Not available to web pages. | Not offered. |

## Feel

| What | Status on iPhone Safari | What LarpCam does |
| --- | --- | --- |
| Haptic taps | No vibration on iPhone for web pages. | Silent on iPhone. Android phones get a short tick. Nothing in the app depends on it. |
| Motion and tilt (for "level" and coaching) | Needs a one-time permission tap. | Will be asked in context when guidance arrives, with one sentence on why. |
| Launch screen | iOS shows a brief blank screen while a Home Screen web app starts. | The page paints black immediately so it reads as the camera waking up. |

## Photos and storage

| What | Status on iPhone Safari | What LarpCam does |
| --- | --- | --- |
| Saving straight into the Photos app | Not available. It has to go through the share sheet. | **Save or share** opens the share sheet; choose **Save Image**. |
| Keeping photos forever | If you use LarpCam only in a Safari tab, iOS may clear a site's data after about a week without visiting. Home Screen apps are not affected. | Add LarpCam to your Home Screen (the app suggests this first), and save photos you care about to Photos. |
| Separate storage | A Safari tab and the Home Screen app don't share data. | Photos taken in the tab won't appear in the installed app. Install first, then shoot. |
| Private browsing | Storage may be refused. | The viewer says clearly when photos aren't being kept. |
| Camera permission prompt | iOS may ask again on a later launch. | Nothing to do but tap Allow. LarpCam explains what happened if the camera is refused. |

## Guidance (arriving in later milestones)

All analysis runs on the phone, with models and code that ship inside the app. That means:

- Subject labels will be plainer than a cloud AI would write ("person", "dog by window" rather than poetry).
- Detection covers common subjects (people, faces, everyday objects) plus a general "what stands out" map. It won't recognise everything.
- Older phones will analyse fewer frames per second so the picture itself stays smooth.

## Other browsers

- **Android Chrome**: everything above works, usually with more (vibration, real zoom, light, an Install button).
- **In-app browsers** (links opened inside Instagram, etc.): many can't use the camera. LarpCam says so and asks you to open the link in Safari.
- **Desktop**: works with a webcam, in a phone-shaped column. Useful for development, not the goal.
