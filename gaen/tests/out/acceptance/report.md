# GARGANTUA acceptance report

- Site: http://127.0.0.1:4173/
- Browser: Chrome/156.0.8078.80
- Started: 2026-11-07T10:15:12.563Z
- Finished: 2026-11-07T10:15:53.832Z
- Cases: 22 passed, 0 failed, 0 skipped
- Console errors: 0
- Page errors: 0

| Status | Case | Detail |
| --- | --- | --- |
| passed | desktop: boots without fatal / console errors | {"title":"GARGANTUA — Schwarzschild Black Hole Raytracer","brand":"GARGANTUA","viewButtons":4,"qualityButtons":3,"debugChips":10,"params":21,"canvas":{"w":288,"h":180,"cw":1440,"ch":900},"bootHidden":true,"bodyClass":"is-ready","state":{"ready":true,"quality": |
| passed | desktop: cinematic camera is moving | {"delta":1.1675} |
| passed | desktop: screenshot API returns a PNG data URL | {"bytesApprox":104927} |
| passed | desktop: pause/resume + UI hide/restore shortcuts | P/H verified |
| passed | desktop: all four view presets via UI | [{"i":"0","active":false,"pressed":"false"},{"i":"1","active":false,"pressed":"false"},{"i":"2","active":false,"pressed":"false"},{"i":"3","active":true,"pressed":"true"}] |
| passed | desktop: keyboard presets Q/W/E/R and V cycle | Q/E/V verified |
| passed | desktop: all ten debug views (0-9) apply | ["00:FINAL COMPOSITE:153770:5e5f9632","01:GEODESIC FIELD:97170:4d171247","02:CRITICAL CURVE:102438:7647c103","03:MULTI-IMAGE:74854:5cbbf8fa","04:DOPPLER SHIFT:92286:a06fd6e2","05:GRAVITATIONAL REDSHIFT:88514:31efea4b","06:HDR BUFFER:149598:149a9386","07:BLOOM  |
| passed | desktop: 21-parameter panel, live slider input, tabs | {"expanded":"true","open":true,"sliders":21,"tabs":4} |
| passed | desktop: quality tiers update engine profile | [{"quality":"standard","maxSteps":230,"active":true},{"quality":"high","maxSteps":310,"active":true},{"quality":"cinematic","maxSteps":520,"active":true}] |
| passed | desktop: manual OrbitControls drag after camera grab | {"movement":4.2071,"controls":{"enabled":true,"minDistance":6.5,"maxDistance":42,"panEnabled":false}} |
| passed | desktop: URL overrides + state persistence | {"exposureBefore":1.23,"persisted":1.11} |
| passed | desktop: state persists across reload | {"exposure":1.11,"debug":4,"camera":[-4.447,7.071,19.231]} |
| passed | desktop: simulation time changes the disk | {"a":"db29a7ed","b":"d36d5806","changed":true,"aLen":93530,"bLen":93542} |
| passed | desktop: share link API builds a deep link | http://127.0.0.1:4173/?quality=standard&time=41.75&debug=4&ui=1&cinematic=0&preset=equatorial&p=eyJleHBvc3VyZSI6MS4xMX0 |
| passed | desktop: WebGL context loss auto-restores | {"losses":1,"restoreAttempts":1,"captureBytes":70157} |
| passed | desktop: final diagnostics clean | {"fps":0,"render":{"width":288,"height":180,"cssWidth":1440,"cssHeight":900,"devicePixelRatio":1,"scale":0.2,"quality":"standard","maxSteps":230,"bloomLevels":4,"hdr":"RGBA16F","frames":9,"contextLost":false,"mobile":false,"contextLosses":1,"restoreAttempts":1 |
| passed | desktop: UI visual plate ready | captured desktop-ui.png |
| passed | mobile: retina layout boots and fits viewport | {"innerWidth":390,"innerHeight":844,"scrollWidth":390,"bodyWidth":390,"canvas":{"w":426,"h":922,"cw":390,"ch":844},"topbar":{"x":0,"y":0,"w":390,"h":44},"deck":{"x":16,"y":731,"w":358,"h":101},"viewButtons":4,"qualityButtons":3,"sliders":21,"overflow":0} |
| passed | mobile: parameter sheet fits and closes | {"top":143.921875,"left":8,"right":382,"bottom":836,"iw":390,"ih":844,"open":true,"scrollable":true} |
| passed | mobile: touch/pointer OrbitControls still available | {"enabled":true,"minDistance":6.5,"maxDistance":42,"panEnabled":false} |
| passed | automation: deterministic shot URL, hidden UI, exact camera/time | {"time":31.5,"preset":1,"quality":"high","diagnostics":{"width":358,"height":224}} |
| passed | automation: debug URL deep link | {"debug":0,"bytes":219270} |