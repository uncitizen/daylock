self.addEventListener("push", (event) => {
  let data = { title: "Daylock", body: "You have a hard task due." };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // ignore
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      data,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});
