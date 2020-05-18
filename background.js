/*
	message format

	in:
	{
		type: "fetch", ...,
		opt: {...},
		data: {...}
	}

	out:
	{
		status: 1, -1,
		data: ...
	}
*/

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type === "fetch") {
		const controller = new AbortController();
		const signal = controller.signal;

		const req = fetch(message.data.url, { ...message.data.obj, signal });

		setTimeout(() => controller.abort(), 5000);

		req.then(
			(res) => {
				let data;

				if (message.opt.dataType === "json") data = res.json();
				else data = res.text();

				data.then(
					(val) =>
						sendResponse({
							status: 1,
							data: val,
						}),
					(why) =>
						sendResponse({
							status: -1,
							data: why,
						})
				);
			},
			(why) =>
				sendResponse({
					status: -1,
					data: why,
				})
		);

		return true;
	}

	return false;
});
