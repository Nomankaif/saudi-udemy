import test from "node:test";
import assert from "node:assert/strict";
import Banner from "../models/banner.model.js";
import { bannerInput, createBanner, deleteBanner, listActiveBanners, updateBanner } from "../controllers/banner.controller.js";

const text = { type: "HERO", title: "  Prepare with purpose  ", description: "A focused path", buttonText: "Explore", buttonUrl: "/exams", displayOrder: 1 };

test("banner input accepts text-only drafts and image banners with uploaded media", () => {
  assert.deepEqual(bannerInput({ ...text, ignored: "not saved" }, { creating: true }), {
    ...text, title: "Prepare with purpose", status: "DRAFT", audience: "EVERYONE", dismissible: true,
  });
  const image = bannerInput({ ...text, type: "IMAGE", desktopImage: "/uploads/media/cover-example.png", status: "PUBLISHED" }, { creating: true });
  assert.equal(image.status, "PUBLISHED");
  assert.equal(image.desktopImage, "/uploads/media/cover-example.png");
  assert.throws(() => bannerInput({ ...text, type: "IMAGE", status: "PUBLISHED" }, { creating: true }), /Upload an image/);
});

test("banner input blocks unsafe destinations and invalid image paths", () => {
  for (const buttonUrl of ["javascript:alert(1)", "//outside.example", "/\\outside", "http://outside.example"]) {
    assert.throws(() => bannerInput({ ...text, buttonUrl }, { creating: true }), /site path or HTTPS/);
  }
  assert.throws(() => bannerInput({ ...text, desktopImage: "/uploads/media/../secret.png" }, { creating: true }), /valid banner image/);
  assert.throws(() => bannerInput({ ...text, buttonText: "" }, { creating: true }), /both button text and destination/);
});

test("create, retire, re-publish and delete use the requested record", async t => {
  const stored = { _id: "banner-1", ...text, status: "PUBLISHED", audience: "EVERYONE", dismissible: true };
  let created;
  t.mock.method(Banner, "create", async value => { created = value; return { _id: "banner-1", ...value }; });
  t.mock.method(Banner, "findById", () => ({ lean: async () => stored }));
  const changes = [];
  t.mock.method(Banner, "findByIdAndUpdate", async (id, update) => { changes.push({ id, update }); return { ...stored, ...update.$set }; });
  t.mock.method(Banner, "findByIdAndDelete", async id => id === stored._id ? stored : null);
  const reply = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } });
  let response = reply();
  await createBanner({ body: text }, response);
  assert.equal(response.statusCode, 201);
  assert.equal(created.status, "DRAFT");
  response = reply();
  await updateBanner({ params: { id: stored._id }, body: { status: "INACTIVE" } }, response);
  assert.equal(response.body.status, "INACTIVE");
  await updateBanner({ params: { id: stored._id }, body: { status: "PUBLISHED" } }, reply());
  assert.deepEqual(changes.map(change => change.id), [stored._id, stored._id]);
  assert.deepEqual(changes.map(change => change.update.$set.status), ["INACTIVE", "PUBLISHED"]);
  response = reply();
  await deleteBanner({ params: { id: stored._id } }, response);
  assert.deepEqual(response.body, { deleted: true });
  await assert.rejects(deleteBanner({ params: { id: "missing" } }, reply()), /Banner not found/);
});

test("public banner query includes only published banners within their schedule", async t => {
  let filter;
  t.mock.method(Banner, "find", value => {
    filter = value;
    return { sort() { return this; }, select() { return this; }, lean: async () => [{ _id: "banner-1", title: "Visible" }] };
  });
  const response = { json(value) { this.body = value; } };
  await listActiveBanners({}, response);
  assert.equal(filter.status, "PUBLISHED");
  assert.deepEqual(filter.audience.$in, ["EVERYONE", "GUESTS"]);
  assert.equal(filter.$and.length, 2);
  assert.equal(response.body[0].title, "Visible");
});
