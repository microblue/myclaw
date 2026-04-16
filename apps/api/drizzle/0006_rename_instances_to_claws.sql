-- Rename instances table to claws
ALTER TABLE "instances" RENAME TO "claws";

-- Rename instance_id column in volumes table to claw_id
ALTER TABLE "volumes" RENAME COLUMN "instance_id" TO "claw_id";
