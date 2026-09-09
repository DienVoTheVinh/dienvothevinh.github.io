# VMTools 0.5.2 — Hình học 3D ổn định

Rotation previously hit-tested points in the rotate tool and could edit vertices. Orbit now changes camera angles only; Select/edit keeps intentional point editing. Pointer cancellation and capture cleanup are explicit. Existing geometry, point IDs, dimensions, and saved customizations are preserved.

World-space face normals provide distinct face shading and convex-shell visibility. Curved meshes get a view-dependent silhouette; open/customized shells retain their faces and use the existing sampled hidden-edge fallback. All 13 presets are checked through 24 angles in both projection modes; live pointer drags starting on vertices preserve geometry across 26 cases.

Web trial refreshes share a single in-flight request, retry transient failures, and refresh on focus, visibility return, online, and pageshow. Signed 90-second trial deadlines remain enforced. After an expired connection is verified again, the app restores the prior workspace; asynchronous recovery saving can no longer overwrite the restored view. Trial account wording no longer says it is unactivated.

Validation: 250 unit tests; browser 3D interaction test; live anonymous trial for 210 seconds with repeated signed renewals and zero locked ticks; Windows packaged launch; native macOS workflow 34406525374 passed signature, mount, launch/relaunch checks. Mac is the authorized TEST-ADHOC build, not notarized; Finder/quarantine and upgrade on a personal Mac are not verified.

Windows running process and executable carry VMTools name and the correct embedded icon. Mac bundle identifier is vn.vmtools.classroom. Website changes do not alter classroom accounts or release download entitlements. Prior hashed assets are retained for existing sessions.
