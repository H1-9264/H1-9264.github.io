# GARGANTUA acceptance report

- Site: http://127.0.0.1:4174/
- Browser: Chrome/156.0.8078.80
- Started: 2026-11-07T10:36:08.362Z
- Finished: 2026-11-07T10:36:50.366Z
- Cases: 22 passed, 0 failed, 0 skipped
- Console errors: 0
- Page errors: 0

| Status | Case | Detail |
| --- | --- | --- |
| passed | desktop: boots without fatal / console errors | {"title":"GARGANTUA — 史瓦西黑洞光线追踪器","brand":"GARGANTUA","viewButtons":4,"qualityButtons":3,"debugChips":10,"params":21,"canvas":{"w":288,"h":180,"cw":1440,"ch":900},"bootHidden":true,"bodyClass":"is-ready","state":{"ready":true,"quality":"standard","preset":null |
| passed | desktop: cinematic camera is moving | {"delta":1.1438} |
| passed | desktop: screenshot API returns a PNG data URL | {"bytesApprox":104981} |
| passed | desktop: pause/resume + UI hide/restore shortcuts | P/H verified |
| passed | desktop: all four view presets via UI | [{"i":"0","active":false,"pressed":"false"},{"i":"1","active":false,"pressed":"false"},{"i":"2","active":false,"pressed":"false"},{"i":"3","active":true,"pressed":"true"}] |
| passed | desktop: keyboard presets Q/W/E/R and V cycle | Q/E/V verified |
| passed | desktop: all ten debug views (0-9) apply | ["00:最终合成:153946:71cf920e","01:测地线场:97594:e7da1e8","02:临界曲线:102714:5febb14e","03:多重像:75566:9ecf97c0","04:多普勒频移:92766:b31d90ed","05:引力红移:89022:a8a6f4e1","06:HDR 缓冲:150106:20cd51e4","07:泛光分离:52542:bdb0e68","08:光线步数成本:94150:17dac6f0","09:仅透镜星空:107106:8242bda2"] |
| passed | desktop: 21-parameter panel, live slider input, tabs | {"expanded":"true","open":true,"sliders":21,"tabs":4} |
| passed | desktop: quality tiers update engine profile | [{"quality":"standard","maxSteps":230,"active":true},{"quality":"high","maxSteps":310,"active":true},{"quality":"cinematic","maxSteps":520,"active":true}] |
| passed | desktop: manual OrbitControls drag after camera grab | {"movement":4.4441,"controls":{"enabled":true,"minDistance":6.5,"maxDistance":42,"panEnabled":false}} |
| passed | desktop: URL overrides + state persistence | {"exposureBefore":1.23,"persisted":1.11} |
| passed | desktop: state persists across reload | {"exposure":1.11,"debug":4,"camera":[-4.729,7.249,19.097]} |
| passed | desktop: simulation time changes the disk | {"a":"db29a7ed","b":"d36d5806","changed":true,"aLen":93530,"bLen":93542} |
| passed | desktop: share link API builds a deep link | http://127.0.0.1:4174/?quality=standard&time=41.75&debug=4&ui=1&cinematic=0&preset=equatorial&p=eyJleHBvc3VyZSI6MS4xMX0 |
| passed | desktop: WebGL context loss auto-restores | {"losses":1,"restoreAttempts":1,"captureBytes":70157} |
| passed | desktop: final diagnostics clean | {"fps":0,"render":{"width":288,"height":180,"cssWidth":1440,"cssHeight":900,"devicePixelRatio":1,"scale":0.2,"quality":"standard","maxSteps":230,"bloomLevels":4,"hdr":"RGBA16F","frames":9,"contextLost":false,"mobile":false,"contextLosses":1,"restoreAttempts":1 |
| passed | desktop: UI visual plate ready | captured desktop-ui.png |
| passed | mobile: retina layout boots and fits viewport | {"innerWidth":390,"innerHeight":844,"scrollWidth":390,"bodyWidth":390,"canvas":{"w":426,"h":922,"cw":390,"ch":844},"topbar":{"x":0,"y":0,"w":390,"h":44},"deck":{"x":16,"y":731,"w":358,"h":101},"viewButtons":4,"qualityButtons":3,"sliders":21,"overflow":0} |
| passed | mobile: parameter sheet fits and closes | {"top":143.921875,"left":8,"right":382,"bottom":836,"iw":390,"ih":844,"open":true,"scrollable":true} |
| passed | mobile: touch/pointer OrbitControls still available | {"enabled":true,"minDistance":6.5,"maxDistance":42,"panEnabled":false} |
| passed | automation: deterministic shot URL, hidden UI, exact camera/time | {"time":31.5,"preset":1,"quality":"high","diagnostics":{"width":358,"height":224}} |
| passed | automation: debug URL deep link | {"debug":0,"bytes":219270} |