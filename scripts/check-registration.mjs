import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function checkRegistration({
  request,
  client,
  owner,
  ownerCookie,
  otherCookie,
  sessionCookie,
}) {
  const base = {
    name: "가입 테스트",
    email: "registration@example.test",
    password: "Testpass123!",
    accepted: true,
  };
  const signup = (choice, email = base.email) =>
    request("/api/auth/signup", {
      method: "POST",
      data: { ...base, email, ...choice },
    });
  assert.equal((await signup({})).status, 400);
  assert.equal(
    (await signup({ role: "admin", plan: "team", teamId: null })).status,
    400,
  );
  assert.equal(
    (await signup({ role: "owner", plan: "free", teamId: null })).status,
    400,
  );
  assert.equal(
    (await signup({ role: "owner", plan: "pro", teamId: null })).status,
    400,
  );
  assert.equal(
    (await signup({ role: "user", plan: "business", teamId: null })).status,
    400,
  );
  assert.equal((await signup({ role: "user", plan: "free" })).status, 400);
  assert.equal(
    (await signup({ role: "user", plan: "free", teamId: randomUUID() })).status,
    400,
  );
  const directory = await request(
    `/api/signup/teams?q=${encodeURIComponent("의 팀")}`,
  );
  assert.equal(directory.status, 200);
  const directoryBody = await directory.json();
  assert.ok(directoryBody.teams.some((team) => team.id === owner.workspaceId));
  assert.ok(
    directoryBody.teams.every(
      (team) => Object.keys(team).sort().join(",") === "id,name",
    ),
  );
  const business = await signup(
    { role: "owner", plan: "business", teamId: null },
    "business@example.test",
  );
  assert.equal(business.status, 201, await business.clone().text());
  assert.equal((await business.json()).user.plan, "business");
  const guest = await signup(
    { role: "user", plan: "free", teamId: null },
    "guest@example.test",
  );
  assert.equal(guest.status, 201);
  const guestUser = (await guest.json()).user,
    guestCookie = sessionCookie(guest);
  assert.equal(guestUser.accountRole, "user");
  assert.equal(guestUser.plan, "free");
  assert.equal(guestUser.role, "viewer");
  assert.equal(
    (
      await request("/api/projects", {
        method: "POST",
        cookie: guestCookie,
        data: { name: "우회", description: "", memberIds: [] },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/api/me", {
        method: "PATCH",
        cookie: guestCookie,
        data: { name: "수정 시도" },
      })
    ).status,
    403,
  );
  assert.deepEqual(
    (await (await request("/api/projects", { cookie: guestCookie })).json())
      .projects,
    [],
  );
  const applied = await signup(
    { role: "user", plan: "free", teamId: owner.workspaceId },
    "applicant@example.test",
  );
  assert.equal(applied.status, 201, await applied.clone().text());
  const applicant = (await applied.json()).user,
    applicantCookie = sessionCookie(applied);
  assert.notEqual(applicant.workspaceId, owner.workspaceId);
  assert.equal(
    Number(
      (
        await client.execute({
          sql: "SELECT count(*) AS n FROM workspace_members WHERE workspace_id=? AND user_id=?",
          args: [owner.workspaceId, applicant.id],
        })
      ).rows[0].n,
    ),
    0,
  );
  assert.deepEqual(
    (await (await request("/api/projects", { cookie: applicantCookie })).json())
      .projects,
    [],
  );
  const ownRequests = await (
    await request("/api/team/requests", { cookie: applicantCookie })
  ).json();
  assert.equal(ownRequests.requests[0].status, "pending");
  const id = ownRequests.requests[0].id;
  assert.equal(
    (
      await request("/api/team/requests", {
        method: "PATCH",
        cookie: ownerCookie,
        data: { id, status: ["approved"] },
      })
    ).status,
    400,
  );
  const review = (cookie, status = "approved") =>
    request("/api/team/requests", {
      method: "PATCH",
      cookie,
      data: { id, status },
    });
  assert.equal((await review(applicantCookie)).status, 403);
  assert.equal((await review(otherCookie)).status, 404);
  assert.equal(
    (
      await request("/api/team/requests", {
        method: "PATCH",
        cookie: ownerCookie,
        requestOrigin: "https://invalid.test",
        data: { id, status: "approved" },
      })
    ).status,
    403,
  );
  await client.execute(
    "CREATE TRIGGER test_approval_audit BEFORE INSERT ON audit_logs WHEN NEW.resource_type='team_join_request' AND NEW.action='UPDATE' BEGIN SELECT RAISE(ABORT,'approval audit rejected'); END",
  );
  assert.equal((await review(ownerCookie)).status, 500);
  assert.equal(
    Number(
      (
        await client.execute({
          sql: "SELECT count(*) AS n FROM workspace_members WHERE workspace_id=? AND user_id=?",
          args: [owner.workspaceId, applicant.id],
        })
      ).rows[0].n,
    ),
    0,
  );
  assert.equal(
    (await (await request("/api/me", { cookie: applicantCookie })).json()).user
      .workspaceId,
    applicant.workspaceId,
  );
  await client.execute("DROP TRIGGER test_approval_audit");
  assert.equal((await review(ownerCookie)).status, 200);
  assert.equal((await review(ownerCookie)).status, 409);
  const approved = (
    await (await request("/api/me", { cookie: applicantCookie })).json()
  ).user;
  assert.equal(approved.workspaceId, owner.workspaceId);
  assert.equal(approved.role, "member");
  assert.equal(approved.accountRole, "user");
  const shared = (
    await (await request("/api/projects", { cookie: applicantCookie })).json()
  ).projects;
  assert.ok(shared.length > 0);
  const future = await request("/api/projects", {
    method: "POST",
    cookie: ownerCookie,
    data: { name: "승인 후 생성", description: "", memberIds: [] },
  });
  assert.equal(future.status, 201, await future.clone().text());
  const futureId = (await future.json()).project.id;
  assert.ok(
    (
      await (await request("/api/projects", { cookie: applicantCookie })).json()
    ).projects.some((project) => project.id === futureId),
  );
  assert.equal(
    (
      await request("/api/projects", {
        method: "POST",
        cookie: applicantCookie,
        data: { name: "승인 후 쓰기", description: "", memberIds: [] },
      })
    ).status,
    201,
  );
  const rejected = await signup(
    { role: "user", plan: "free", teamId: owner.workspaceId },
    "rejected@example.test",
  );
  const rejectedUser = (await rejected.json()).user,
    rejectedCookie = sessionCookie(rejected);
  const rejectedRequest = (
    await (
      await request("/api/team/requests", { cookie: rejectedCookie })
    ).json()
  ).requests[0];
  assert.equal(
    (
      await request("/api/team/requests", {
        method: "PATCH",
        cookie: ownerCookie,
        data: { id: rejectedRequest.id, status: "rejected" },
      })
    ).status,
    200,
  );
  assert.equal(
    (await (await request("/api/me", { cookie: rejectedCookie })).json()).user
      .workspaceId,
    rejectedUser.workspaceId,
  );
  assert.deepEqual(
    (await (await request("/api/projects", { cookie: rejectedCookie })).json())
      .projects,
    [],
  );
  // Simulate the uncompleted account issued by a new OAuth callback.
  await client.execute({
    sql: "UPDATE users SET onboarding_complete=0 WHERE id=?",
    args: [guestUser.id],
  });
  assert.equal(
    (await request("/api/projects", { cookie: guestCookie })).status,
    403,
  );
  const incompletePage = await request("/dashboard", { cookie: guestCookie });
  if (incompletePage.status === 200)
    assert.match(await incompletePage.text(), /onboarding/);
  else assert.equal(incompletePage.status, 307);
  const completed = await request("/api/onboarding", {
    method: "POST",
    cookie: guestCookie,
    data: { role: "owner", plan: "team", teamId: null },
  });
  assert.equal(completed.status, 200, await completed.clone().text());
  assert.equal((await completed.json()).user.accountRole, "owner");
  assert.equal(
    (
      await request("/api/onboarding", {
        method: "POST",
        cookie: guestCookie,
        data: { role: "owner", plan: "business", teamId: null },
      })
    ).status,
    409,
  );
  const relogin = await request("/api/auth/login", {
    method: "POST",
    data: { email: "applicant@example.test", password: base.password },
  });
  assert.equal((await relogin.json()).user.workspaceId, owner.workspaceId);
  console.log(
    "PASS: owner plans, required choices, Guest Free, member approval/rejection, tenant boundaries, existing/future project sharing and social onboarding gate.",
  );
}
