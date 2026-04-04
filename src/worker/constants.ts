export const HARNESS_VERSION = "claude-rojo-v1";
export const EVAL_PROFILE = "roblox-social-v1";
export const ARTIFACT_TYPE = "roblox-rojo";

export const REQUIRED_ARTIFACT_FILES = [
	"default.project.json",
	"README.generated.md",
	"src/client/Mechanic.client.luau",
	"src/server/Mechanic.server.luau",
	"src/shared/GameSpec.json",
	"src/shared/MechanicContract.luau",
] as const;

export const EDITABLE_ARTIFACT_FILES = [
	"src/client/Mechanic.client.luau",
	"src/server/Mechanic.server.luau",
	"src/shared/GameSpec.json",
] as const;

export const FORBIDDEN_LUA_PATTERNS = [
	"HttpService:GetAsync",
	"HttpService:PostAsync",
	"loadstring(",
	"getfenv(",
	"setfenv(",
	"os.execute(",
] as const;
