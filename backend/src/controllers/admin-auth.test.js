import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import {
  adminLogin,
  adminLogout,
  adminSessionKey,
  limitAdminLogin,
} from "./admin-auth.controller.js";

test("admin password authentication and session lifecycle", async () => {
  const previous = process.env.ADMIN_PASSWORD;
  const originalFind = User.findOne;
  try {
    delete process.env.ADMIN_PASSWORD;
    await assert.rejects(adminLogin({ body: {} }, {}), { statusCode: 503 });
    process.env.ADMIN_PASSWORD = "test-only-password-12345";
    await assert.rejects(adminLogin({ body: { password: "wrong" } }, {}), {
      statusCode: 401,
    });
    await assert.rejects(adminLogin({ body: { password: {} } }, {}), {
      statusCode: 401,
    });
    User.findOne = async () => ({
      id: "000000000000000000000001",
      role: "ADMIN",
      isActive: true,
    });
    let session;
    const response = {
      cookie(name, value, options) {
        assert.equal(name, "admin_session");
        assert.equal(options.httpOnly, true);
        session = value;
        return this;
      },
      set() {
        return this;
      },
      json(value) {
        assert.equal(value.success, true);
      },
      clearCookie(name) {
        assert.equal(name, "admin_session");
      },
    };
    await adminLogin(
      { body: { password: process.env.ADMIN_PASSWORD } },
      response,
    );
    const payload = jwt.verify(session, adminSessionKey(), {
      audience: "admin",
      algorithms: ["HS256"],
    });
    assert.equal(payload.sub, "000000000000000000000001");
    assert.equal(payload.exp - payload.iat, 7200);
    process.env.ADMIN_PASSWORD = "replacement-test-password";
    assert.throws(() => jwt.verify(session, adminSessionKey()));
    adminLogout({}, response);
    for (let index = 0; index < 10; index++)
      limitAdminLogin({ ip: "test-ip" }, {}, (error) =>
        assert.equal(error, undefined),
      );
    limitAdminLogin({ ip: "test-ip" }, {}, (error) =>
      assert.equal(error.statusCode, 429),
    );
  } finally {
    User.findOne = originalFind;
    if (previous === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previous;
  }
});
