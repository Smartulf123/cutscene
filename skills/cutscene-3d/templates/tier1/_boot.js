      // Cutscene 3D Tier 1 boot (classic script): config, per-instance variables, the paused clock.
      // Seek-safe: every frame is render(t) from one linear GSAP clock; hf-seek re-renders that time.
      (function () {
        var ID = "__CS3D_ID__";
        var config = __CS3D_CONFIG__;
        var scoped = {};
        try {
          scoped =
            (window.__hyperframes && window.__hyperframes.getVariables && window.__hyperframes.getVariables()) || {};
        } catch (error) {
          scoped = {};
        }
        Object.keys(config.vars || {}).forEach(function (k) {
          if (scoped[k] !== undefined && scoped[k] !== "") config.vars[k] = scoped[k];
        });
        var root = document.getElementById("cs3d-" + ID);
        var duration = Math.max(0.001, parseFloat(root && root.dataset.duration) || config.duration);
        var clock = { t: 0 };
        var host = { id: ID, config: config, duration: duration, clock: clock, render: null };
        window.__cs3d = window.__cs3d || {};
        window.__cs3d[ID] = host;
        window.__hf = window.__hf || {};
        window.__hf.buildReady = window.__hf.buildReady || {};
        window.__hf.buildReady[ID] = new Promise(function (resolve, reject) {
          host.ready = resolve;
          host.fail = reject;
        });
        var tl = gsap.timeline({ paused: true });
        tl.to(clock, {
          t: duration,
          duration: duration,
          ease: "none",
          onUpdate: function () {
            if (host.render) host.render(clock.t);
          },
        });
        window.__timelines = window.__timelines || {};
        window.__timelines[ID] = tl;
        host.timeline = tl;
        window.addEventListener("hf-seek", function () {
          if (host.render) host.render(tl.time());
        });
      })();
