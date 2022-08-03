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
			if(data.data?._id) return ui.notifications.warn("You cannot add an item from an actor.");
			else return ui.notifications.warn("Something has gone terribly wrong.");
		}

		// must be item-type tool, loot, backpack, equipment, weapon, consumable.
		const uuid = !!pack ? `Compendium.${pack}.${id}` : game.items.get(id).uuid;
		const item = await fromUuid(uuid);
		const validItemTypes = ["weapon", "equipment", "consumable", "tool", "loot", "backpack"];
		if(!validItemTypes.includes(item.type)){
			return ui.notifications.warn(`You cannot add a ${item.type} to the loot list.`);
		}

		const list = this.element[0].querySelector("table.SLL-item-list > tbody");

		// append:
		const newItem = document.createElement("tr");
		newItem.classList.toggle("SLL-item-row");
		newItem.innerHTML = `
		<td class="SLL-item-quantity">
			<input type="text" value="1">
		</td>
		<td class="SLL-item-name" data-pack="${pack ?? ''}" data-id="${id}" data-uuid="${item.uuid}">${item.name}</td>
		<td class="SLL-item-delete">
			<button class="SLL-item-delete"><i class="fas fa-trash"></i></button>
		</td>`;
		
		
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
			const quantity = row.querySelector(".SLL-item-quantity > input").value;
			const name = row.querySelector("td.SLL-item-name");
			if(!name) continue;
			const {uuid, pack, id} = name.dataset;

			if(!quantity || !id) continue;

			lootArray.push({quantity, pack, id, uuid, name: name.innerText});
		}
		
		await this.actor.setFlag("simple-loot-list", "loot-list", lootArray);
		this.close();
	}

	activateListeners(html){
		super.activateListeners(html);
		const sheet = this.element[0];
		html[0].addEventListener("click", async (event) => {
			const deleteButton = event.target.closest("button.SLL-item-delete");
			const itemName = event.target.closest("td.SLL-item-name");
			if(!!deleteButton){
				const row = deleteButton.closest("tr.SLL-item-row");
				if(row){
					row.remove();
					sheet.style.height = "auto";
				}
			}
			if(!!itemName){
				const {uuid, pack, id} = itemName.dataset;
				const item = !!uuid ? await fromUuid(uuid) : !!pack ? await fromUuid(`Compendium.${pack}.${id}`) : game.items.get(id);
				if(!item) return;
				return item.sheet.render(true);
			}
		});
	}
}
