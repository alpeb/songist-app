chrome.app.runtime.onLaunched.addListener(function() {
  chrome.app.window.create('../app/templates/main.html', {
    // can't use id cuz for some reason every time the app is opened,
    // its height is diminished
    //id: "songist",
    bounds: {
      width: 1200,
      height: 800
    }
  });
  console.log("app launched");
});
