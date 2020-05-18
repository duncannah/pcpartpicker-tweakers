class RequestHandler {
	constructor() {
		this.queue = [];
		this.currentlyRunning = 0;

		this.MAXCONCUR = 2;
		this.DELAY = 500;
	}

	_continue(noDelay = false) {
		// after a request is done
		if (!this.queue.length) return;

		let item = this.queue.shift();

		if (item === undefined) return;

		this.currentlyRunning++;

		setTimeout(
			() => {
				item.func(...item.args).then(
					(ret) => [this.currentlyRunning--, item.resolve(ret)],
					(ret) => [this.currentlyRunning--, item.reject(ret)]
				);
			},
			noDelay ? 1 : this.DELAY
		);
	}

	_isAvailable() {
		return this.currentlyRunning < this.MAXCONCUR;
	}

	_doRequest(url, dataType) {
		return new Promise((resolve, reject) => {
			chrome.runtime.sendMessage(
				null,
				{
					type: "fetch",
					opt: { dataType },
					data: {
						url: url,
						obj: {},
					},
				},
				{},
				(resp) => {
					if (resp.status === 1) {
						resolve(resp.data);

						this._continue();
					} else {
						console.error("Fetch failed", resp.data | "");

						reject(resp.data | "");

						this._continue();
					}
				}
			);
		});
	}

	request(url, dataType) {
		return new Promise((resolve, reject) => {
			let id = Math.round(Math.random() * 8);
			let obj = {
				id: id,
				func: this._doRequest.bind(this),
				args: [url, dataType],
				resolve,
				reject,
			};

			this.queue.push(obj);

			if (this._isAvailable()) this._continue(true);
		});
	}
}

class App {
	constructor() {
		this.components = [];
		this.totalPriceEl = null;

		this.requestHandler = new RequestHandler();
	}

	initComponents() {
		let els = document.querySelectorAll(".td__name > a");

		if (!els.length) return false;

		els.forEach((e) => {
			let prodEl = e.parentElement.parentElement;

			let name = e.innerText.replace(/\u200B/g, "");

			// list of search terms to try, from most precise to less
			let searchTerms = [];

			// retrieve part number from url
			if (!e.href.includes("#view_custom_part")) {
				let lastWord = name.substr(name.lastIndexOf(" ") + 1).toLowerCase();
				searchTerms.push(e.href.substr(e.href.lastIndexOf(lastWord) + lastWord.length + 1));
			}

			// full name, then removing last word until 3 words left
			let words = name.split(" ");
			do {
				searchTerms.push(words.join(" "));

				words.pop();
			} while (words.length > 3);

			this.components.push({
				name: name,
				url: e.href,
				el: e,

				searchTerms: searchTerms,

				twLink: "javascript:void(0)",

				table: {
					base: {
						pcp:
							parseFloat((prodEl.querySelector(".td__base").innerText.match(/^€([\d\.]+)$/m) || [])[1]) ||
							0,
						tw: false,
						twEl: null,
					},
					promo: {
						pcp:
							parseFloat(
								(prodEl.querySelector(".td__promo").innerText.match(/^€([\d\.]+)$/m) || [])[1]
							) || 0,
						tw: false,
						twEl: null,
					},
					shipping: {
						pcp:
							parseFloat(
								(prodEl.querySelector(".td__shipping").innerText.match(/^€([\d\.]+)$/m) || [])[1]
							) || 0,
						tw: false,
						twEl: null,
					},
					tax: {
						pcp:
							parseFloat((prodEl.querySelector(".td__tax").innerText.match(/^€([\d\.]+)$/m) || [])[1]) ||
							0,
						tw: false,
						twEl: null,
					},
					price: {
						pcp:
							parseFloat(
								(prodEl.querySelector(".td__price").innerText.match(/^€([\d\.]+)$/m) || [])[1]
							) || 0,
						tw: false,
						twEl: null,
					},
				},
			});
		});

		return true;
	}

	async getPrice(component) {
		let searchTerms = component.searchTerms;

		while (searchTerms.length > 0) {
			try {
				let term = searchTerms.shift();

				let res = await this.requestHandler.request(
					"https://tweakers.net/ajax/zoeken/pricewatch/?keyword=" + encodeURIComponent(term) + "&output=json",
					"json"
				);

				if (typeof res.entities === "object" && res.entities.length > 0) {
					component.twLink = res.entities[0].link;

					component.table.base.tw = parseFloat(
						res.entities[0].minPrice
							? res.entities[0].minPrice
									.match(/; ([\d,\.\-]+)<\/a>$/)[1]
									.replace(",-", "")
									.replace(".", "")
									.replace(",", ".")
							: false
					);

					component.table.price.tw = component.table.base.tw;

					searchTerms = [];
				}
			} catch (rsn) {
				console.error(rsn);
				searchTerms = [];
			}
		}

		this.updatePrices(component);
	}

	addPrices() {
		this.components.forEach((e) => {
			let tr = e.el.parentElement.parentElement;

			Object.keys(e.table).forEach((k) => {
				let td = tr.querySelector(".td__" + k);

				if (td.classList.contains("td--empty")) {
					td.classList.remove("td--empty");
					td.innerText += "--";
				}

				let twEl;

				if (k === "price") {
					twEl = document.createElement("a");
					twEl.href = "#"; // TODO
				} else {
					twEl = document.createElement("div");
				}

				twEl.classList.add("tw-" + k);
				twEl.innerText = "...";

				td.appendChild(twEl);

				e.table[k].twEl = twEl;

				this.updatePrice(e.table[k]);
			});

			this.getPrice(e);
		});

		// total price
		this.totalPriceEl = document
			.querySelectorAll(".tr__total")
			[document.querySelectorAll(".tr__total").length - 1].cloneNode(true);

		this.totalPriceEl.querySelector(".td__label").innerText = "Total with Tweakers:";
		this.totalPriceEl.querySelector(".td__price").classList.add("tw-price", "loading");
		this.totalPriceEl.querySelector(".td__price").innerText = "--";

		document.querySelector(".tr__total").parentElement.appendChild(this.totalPriceEl);
	}

	updatePrice(t, c = false) {
		if (c) t.twEl.href = c.twLink;

		t.twEl.innerText = t.tw
			? t.tw === -1
				? "..."
				: t.tw.toLocaleString("en-GB", {
						style: "currency",
						currency: "EUR",
						minimumFractionDigits: 2,
				  })
			: "--";
	}

	updatePrices(e) {
		let tr = e.el.parentElement.parentElement;

		Object.keys(e.table).forEach((k) => {
			let t = e.table[k];

			this.updatePrice(t, e);
		});

		// highlight cheaper price
		if (e.table.price.tw && e.table.price.tw <= e.table.price.pcp) {
			e.el.parentElement.parentElement.querySelector(".td__price > a.tw-price").style.textShadow = "0 0 5px";
		} else {
			(
				e.el.parentElement.parentElement.querySelector(".td__price > a:not(.tw-price)") || { style: {} }
			).style.textShadow = "0 0 5px";
		}

		// update total price
		let total = 0;
		this.components.forEach(
			(c) =>
				(total +=
					c.table.price.tw && c.table.price.tw <= c.table.price.pcp ? c.table.price.tw : c.table.price.pcp)
		);

		this.totalPriceEl.querySelector(".td__price").innerText = total.toLocaleString("en-GB", {
			style: "currency",
			currency: "EUR",
			minimumFractionDigits: 2,
		});

		if (this.requestHandler.currentlyRunning === 0 && this.requestHandler.queue.length === 0)
			this.totalPriceEl.querySelector(".td__price").classList.remove("loading");
	}
}

(async () => {
	let app = new App();

	if (app.initComponents()) app.addPrices();
})();
