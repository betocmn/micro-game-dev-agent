local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local MechanicContract = require(Shared:WaitForChild("MechanicContract"))

local MechanicClient = {}

function MechanicClient.start()
	print("Client mechanic bootstrap ready")
	return {
		status = "ready",
		contractVersion = MechanicContract.version,
	}
end

return MechanicClient
