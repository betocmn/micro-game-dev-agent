local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local MechanicContract = require(Shared:WaitForChild("MechanicContract"))

local MechanicServer = {}

function MechanicServer.start()
	print("Server mechanic bootstrap ready")
	return {
		status = "ready",
		contractVersion = MechanicContract.version,
	}
end

return MechanicServer
