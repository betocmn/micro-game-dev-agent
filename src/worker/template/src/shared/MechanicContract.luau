local MechanicContract = {
	version = "claude-rojo-v1",
	remoteEventName = "SocialLoopEvent",
	requiredServerExports = {
		"start",
	},
	requiredClientExports = {
		"start",
	},
}

return MechanicContract
