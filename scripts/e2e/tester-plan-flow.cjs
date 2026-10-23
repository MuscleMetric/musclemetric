"use strict";

/**
 * End-to-end plan create/edit/ownership tests run only with a disposable
 * local Supabase user. This function must never be imported by the production
 * tester job: creating a plan changes active_plan_id and weekly targets.
 */
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

function unwrap(response, label) {
  if (response.error) {
    throw new Error(label + ": " + response.error.message + " (" + response.error.code + ")");
  }
  return response.data;
}

async function verifyTesterPlanFlow({ userClient, userId, exerciseIds }) {
  const [strengthId, cardioId] = exerciseIds;
  const title = "AUTOMATED_E2E_PLAN_" + randomUUID();
  const endDate = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const initialExercises = [{
    exerciseId: strengthId, order_index: 0, supersetGroup: null, isDropset: false,
    target_sets: 3, target_reps: 5, target_weight: 60,
  }];
  const initialGoals = [{
    exerciseId: strengthId, metrics: ["weight"], start_weight: 50,
    target_weight: 80, summary: "E2E bench target",
  }];

  // Actual app create/review.tsx payload. Tests SECURITY DEFINER user-ID guard.
  const createArgs = {
    p_user_id: userId, p_title: title, p_end_date: endDate,
    p_workouts: [{ title: "Strength A", exercises: initialExercises }],
    p_goals: initialGoals,
  };
  const forbiddenCreate = await userClient.rpc("create_plan_v1", {
    ...createArgs, p_user_id: randomUUID(),
  });
  assert.ok(forbiddenCreate.error, "Forged owner must not be able to create a plan");

  const planId = unwrap(await userClient.rpc("create_plan_v1", createArgs),
    "Create full plan through authenticated RPC");
  assert.match(planId, /^[0-9a-f-]{36}$/i);

  const plan = unwrap(await userClient.from("plans").select("id,title,end_date,weekly_target_sessions")
    .eq("id",planId).eq("user_id",userId).single(), "Read created plan");
  assert.equal(plan.title,title);
  assert.equal(plan.end_date,endDate);
  assert.equal(plan.weekly_target_sessions,1);

  const activeProfile = unwrap(await userClient.from("profiles").select("active_plan_id")
    .eq("id",userId).single(), "Read active plan from profile");
  assert.equal(activeProfile.active_plan_id,planId, "New plan must activate");

  const planned = unwrap(await userClient.from("plan_workouts")
    .select("id,workout_id,title,order_index,is_archived")
    .eq("plan_id",planId).eq("is_archived",false), "Read plan workouts");
  assert.equal(planned.length,1);
  assert.equal(planned[0].title,"Strength A");

  const exerciseRows = unwrap(await userClient.from("workout_exercises")
    .select("id,workout_id,exercise_id,target_sets,target_reps,target_weight,is_archived")
    .eq("workout_id",planned[0].workout_id).eq("is_archived",false),
  "Read plan exercise prescriptions");
  assert.equal(exerciseRows.length,1);
  assert.equal(exerciseRows[0].exercise_id,strengthId);
  assert.equal(Number(exerciseRows[0].target_sets),3);
  assert.equal(Number(exerciseRows[0].target_reps),5);
  assert.equal(Number(exerciseRows[0].target_weight),60);

  const goalRows = unwrap(await userClient.from("goals").select("id,exercise_id,target_weight,is_active")
    .eq("plan_id",planId).eq("user_id",userId), "Read plan goals");
  assert.equal(goalRows.length,1);
  assert.equal(goalRows[0].exercise_id,strengthId);
  assert.equal(Number(goalRows[0].target_weight),80);
  console.log("PASS create_plan_v1: plan + weekly schedule + exercise targets + goal + active profile");

  const updatedTitle = title + "_EDITED";
  const updateArgs = {
    p_plan_id:planId, p_user_id:userId, p_title:updatedTitle, p_end_date:endDate,
    p_workouts:[
      { id:planned[0].id,title:"Strength B",order_index:0,
        exercises:[{ id:exerciseRows[0].id,exerciseId:strengthId,order_index:0,
          supersetGroup:null,isDropset:false }] },
      { id:null,title:"Cardio B",order_index:1,
        exercises:[{ id:null,exerciseId:cardioId,order_index:0,
          supersetGroup:null,isDropset:false }] },
    ],
    p_goals:[{ id:goalRows[0].id,exerciseId:strengthId,
      mode:"exercise_weight",target:90,unit:"kg",start:50 }],
  };
  // The edit RPC must not allow forged ownership even with a valid plan ID.
  const forbiddenEdit = await userClient.rpc("update_full_plan",{
    ...updateArgs,p_user_id:randomUUID(),
  });
  assert.ok(forbiddenEdit.error,"Forged owner must not be able to edit plan");

  unwrap(await userClient.rpc("update_full_plan",updateArgs),"Edit complete plan through authenticated RPC");

  const updated = unwrap(await userClient.from("plans").select("title").eq("id",planId).single(),
    "Read edited plan");
  assert.equal(updated.title,updatedTitle);

  const updatedWorkouts = unwrap(await userClient.from("plan_workouts")
    .select("id,workout_id,title,order_index,is_archived")
    .eq("plan_id",planId).eq("is_archived",false).order("order_index"),
  "Read edited plan workouts");
  assert.deepEqual(updatedWorkouts.map(w=>w.title),["Strength B","Cardio B"]);
  assert.deepEqual(updatedWorkouts.map(w=>w.order_index),[0,1]);

  const cardioRows = unwrap(await userClient.from("workout_exercises")
    .select("exercise_id").eq("workout_id",updatedWorkouts[1].workout_id).eq("is_archived",false),
  "Read new cardio workout exercise");
  assert.deepEqual(cardioRows.map(x=>x.exercise_id),[cardioId]);

  const updatedGoal = unwrap(await userClient.from("goals")
    .select("id,target_number,is_active").eq("id",goalRows[0].id).single(),
  "Read updated goal");
  assert.equal(Number(updatedGoal.target_number),90);
  assert.equal(updatedGoal.is_active,true);

  console.log("PASS update_full_plan: rename + existing workout + new cardio workout + goal update + owner guard");
  return { planId, planWorkoutId: updatedWorkouts[0].id, workoutId: updatedWorkouts[0].workout_id };
}

module.exports = { verifyTesterPlanFlow };
