const { isAccessCodePage } = require("../utils");

describe("isAccessCodePage", () => {
  it("recognises the access code form", () => {
    const html = `<main class="row content password_protected">
      <h2>Please enter the access code</h2>
      <form method="GET" action=""><input type="password" name="access" /></form>
    </main>`;
    expect(isAccessCodePage(html)).toBe(true);
  });

  it("does not flag an event page", () => {
    const html = `<main class="row content"><div class="detail-content">
      <div class="detail-content__description"><p>A film</p></div>
    </div></main>`;
    expect(isAccessCodePage(html)).toBe(false);
  });
});
