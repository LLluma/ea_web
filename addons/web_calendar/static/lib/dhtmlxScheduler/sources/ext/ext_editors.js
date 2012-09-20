/*
This software is allowed to use under GPL or you need to obtain Commercial or Enterise License
to use it in not GPL project. Please contact sales@dhtmlx.com for details
*/
scheduler.form_blocks['combo']={
	render:function(sns) {
		var res = '';
		res += "<div class='"+sns.type+"' style='height:"+(sns.height||20)+"px;' ></div>";	
		return res;
	},
	set_value:function(node,value,ev,config){
		if(node._combo) {
			node._combo.destructor();
		}  
		window.dhx_globalImgPath = config.image_path||'/';
		node._combo = new dhtmlXCombo(node, config.name, node.offsetWidth-8);		
		node._combo.enableFilteringMode(!!config.filtering, config.script_path||null, !!config.cache);
		
		if (!config.script_path) { // script-side filtration is used
			var all_options = [];
			for (var i = 0; i < config.options.length; i++) {
				var single_option = [];
				single_option.push(config.options[i].key);
				single_option.push(config.options[i].label);
				all_options.push(single_option);
			}
			node._combo.addOption(all_options);
			if (ev[config.map_to]) {
				var index = node._combo.getIndexByValue(ev[config.map_to]);
				node._combo.selectOption(index);
			}
		} else { // server-side filtration is used
			node._combo.setComboValue(ev[config.map_to]||null);
		}
	},
	get_value:function(node,ev,config){
		var selected_id = node._combo.getSelectedValue(); // value = key
		return selected_id;
	},
	focus:function(node){
	}
};

scheduler.form_blocks['radio']={
	render:function(sns) {
		var res = '';
		res += "<div class='dhx_cal_ltext dhx_cal_radio' style='height:"+sns.height+"px;' >";
		for (var i=0; i<sns.options.length; i++) {
			var id = scheduler.uid();
			res += "<input id='"+id+"' type='radio' name='"+sns.name+"' value='"+sns.options[i].key+"'><label for='"+id+"'>"+" "+sns.options[i].label+"</label>";
			if(sns.vertical)
				res += "<br/>";
		}
		res += "</div>";
		
		return res;
	},
	set_value:function(node,value,ev,config){
		var radiobuttons = node.getElementsByTagName('input');
		for (var i = 0; i < radiobuttons.length; i++) {
			radiobuttons[i].checked = false;
			if (radiobuttons[i].value == ev[config.map_to]) {
				radiobuttons[i].checked = true;
			}
		}
	},
	get_value:function(node,ev,config){
		var radiobuttons = node.getElementsByTagName('input');
		for(var i=0; i<radiobuttons.length; i++) {
			if(radiobuttons[i].checked) {
				return radiobuttons[i].value;
			}
		}
	},
	focus:function(node){
	}
};

scheduler.form_blocks['checkbox']={
	render:function(sns) {
		if (scheduler.config.wide_form)
			return '<div class="dhx_cal_wide_checkbox"></div>';
		else
			return '';
	},
	set_value:function(node,value,ev,config){
        node=document.getElementById(config.id);
		var id = scheduler.uid();
		var isChecked = false;
		if (typeof config.checked_value != 'undefined' && ev[config.map_to] == config.checked_value) {
			isChecked = true;
		}
		node.className += " dhx_cal_checkbox";
		var check_html = "<input id='"+id+"' type='checkbox' value='true' name='"+config.name+"'"+((isChecked)?"checked='true'":'')+"'>"; 
		var label_html = "<label for='"+id+"'>"+(scheduler.locale.labels["section_"+config.name]||config.name)+"</label>";
		if (scheduler.config.wide_form){
			node.innerHTML = label_html;
			node.nextSibling.innerHTML=check_html;
		} else 
			node.innerHTML=check_html+label_html;
	},
	get_value:function(node,ev,config){
        node=document.getElementById(config.id);
		var checkbox = node.getElementsByTagName('input')[0]; // moved to the header
		if (!checkbox)
			checkbox = node.nextSibling.getElementsByTagName('input')[0];
		return (checkbox.checked)?(config.checked_value||true):(config.unchecked_value||false);
	},
	focus:function(node){
	}
};