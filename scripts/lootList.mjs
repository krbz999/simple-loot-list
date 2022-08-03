export class LootList extends FormApplication {
	
	constructor(actor){
		super();
		this.actor = actor;
	}
	
	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			closeOnSubmit: false,
			classes: ["sheet"],
			width: 550,
			template: "/modules/simple-loot-list/templates/lootListTemplate.html",
			height: "auto",
			dragDrop: [{ dragSelector: null, dropSelector: ".SLL-item-list-add" }],
		});
	}

	get lootItems(){
		return this.actor.getFlag("simple-loot-list", "loot-list") ?? [];
	}

	async getData(options){
		let data = super.getData(options);
		data.lootItems = this.lootItems;
		return data;
	}
	
	async _onDrop(event){
		event.stopPropagation();
		let data;
		try{
			data = JSON.parse(event.dataTransfer.getData("text/plain"));
			
		} catch(err) {
			return false;
		}
		const {type, pack, id} = data;
		// must be type Item, and pack and id must be defined.

		if(type !== "Item"){
			return ui.notifications.warn("You can only add items to the loot list.");
		}
		if(!id){
			return ui.notifications.warn("Something has gone terribly wrong.");
		}

		// must be item-type loot, container, equipment, weapon, consumable.
		const item = !!pack ? await fromUuid(`Compendium.${pack}.${id}`) : game.items.get(id);
		const validItemTypes = ["weapon", "equipment", "consumable", "tool", "loot", "backpack"];
		if(!validItemTypes.includes(item.type)){
			return ui.notifications.warn(`You cannot add a ${item.type} to the loot list.`);
		}

		const list = this.element[0].querySelector("div.SLL-item-list");

		//const link = await TextEditor.enrichHTML(item.link);

		// append:
		const newItem = document.createElement("div");
		newItem.classList.toggle("form-group");
		newItem.classList.toggle("SLL-item-row");
		newItem.innerHTML = `
		<div class="form-fields SLL-item-fields">
			<input type="text" class="SLL-item-quantity" value="1">
			<input type="text" class="SLL-item-pack" value="${pack ?? ''}">
			<input type="text" class="SLL-item-id" value="${id}">
			<input type="text" class="SLL-item-name" value="${item.name}">
			<button class="SLL-item-delete">
				<i class="fas fa-trash"></i>
			</button>
		</div>`;
		
		
		list.appendChild(newItem);

		this.element[0].style.height = "auto";
	}

	async _updateObject(event, obj){
		event.stopPropagation();
		const html = event.target;

		// for each entry, add to object.
		const lootArray = [];
		const rows = html.querySelectorAll(".SLL-item-row");
		for(let row of rows){
			const quantity = row.querySelector(".SLL-item-quantity").value;
			const pack = row.querySelector(".SLL-item-pack").value;
			const id = row.querySelector(".SLL-item-id").value;
			const name = row.querySelector(".SLL-item-name").value;

			if(!quantity || !id || !name) continue;

			lootArray.push({quantity, pack, id, name});
		}

		
		await this.actor.setFlag("simple-loot-list", "loot-list", lootArray);
		this.close();
	}

	activateListeners(html){
		super.activateListeners(html);
		const sheet = this.element[0];
		html[0].addEventListener("click", (event) => {
			const button = event.target.closest("button.SLL-item-delete");
			if(!button) return;

			const row = button.closest("div.form-group.SLL-item-row");
			if(row){
				row.remove();
				sheet.style.height = "auto";
			}
		});
	}
}
