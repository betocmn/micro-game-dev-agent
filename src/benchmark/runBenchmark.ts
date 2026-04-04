import dataset from "@/evals/datasets/roblox-social-v1.json";

async function main() {
	console.log(
		`Loaded ${dataset.cases.length} benchmark cases for profile ${dataset.evalProfile}.`,
	);
}

void main();
