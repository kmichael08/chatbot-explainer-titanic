// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';
 
const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
const {Card, Suggestion, Image} = require('dialogflow-fulfillment');
const storage_context = 'storage_context';
const all_variables = ['age', 'gender', 'fare', 'class', 'parch', 'sibsp', 'embarked'];
const http = require('http');
const server_address = 'http://52.31.27.158:8787';
const pretty_vars = {
 	'age': 'age',
  	'gender': 'gender',
  	'fare': 'fare',
  	'parch': 'number of parents/children',
  	'sibsp': 'number of siblings/spouse',
  	'embarked': 'place of embarkment',
  	'class': 'class'
};

process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements
 
exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({ request, response });
  const parameters = request.body.queryResult.parameters;
  console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
  console.log('Dialogflow Request body: ' + JSON.stringify(request.body));
  
  function fallback(agent) {
    agent.add(`Sorry, I don't understand yet. But I'll learn from this conversation and improve in the future!`);
    agent.add(`Click below if you need help`);
    agent.add(new Suggestion('help'));
  }
  
   function variable_explanation(variable, agent) {
        switch(variable) {
            case 'age':
                return 'Age in years.';
            case 'gender':
                return 'Gender either "male" or "female"';
            case 'embarked':
            	return 'Where did the passenger embark. One of ("Belfast", "Cherbourg", "Queenstown", "Southampton")';
          	case 'fare':
            	return 'Ticket fare in pounds.';
          	case 'parch':
            	return 'Number of Parent/Child aboard';
          	case 'sibsp':
            	return 'Number of Sibling/Spouse aboard';
          	case 'class':
            	return 'Passenger class. One of ("1st", "2nd", "3rd", "deck crew", "engineering crew", "restaurant staff" or “victualling crew”)';
            default:
                return `I don't know the variable ${variable}`;
        }
    }

    function explain_feature(agent) {
        let feature = request.body.queryResult.parameters.variable;
        let text = variable_explanation(feature, agent);
        agent.add(text);
    }
  

   function predict(agent, params) {
      	let path = `${server_address}/predict?${params}`;
     	console.log(`API path:${path}`);
        return new Promise((resolve, reject) => {
            http.get(path, (res) => {
                let body = ''; // var to store the response chunks
                res.on('data', (d) => { body += d; }); // store each response chunk
                res.on('end', () => {
                    // After all the data has been received parse the JSON for desired data
                    // Resolve the promise with the output text
                  	let survival_chance = JSON.parse(body).result[0].toString();
                  	let res_str = survival_message(survival_chance);
                  	console.log(res_str);
                  	let output = agent.add(res_str);
                    resolve(output);
                });
                res.on('error', (error) => {
                  	console.log('error in API call');
                    reject();
                });
            });
        });
    }

   function age(agent) {
     let age_val = JSON.stringify(parameters.age.amount);
	 set_var_value(agent, 'age', age_val);
     let params = formatted_parameters('age', age_val);
     return predict(agent, params);
  }
  
   function setting_fare(agent) {
     let fare_val = JSON.stringify(parameters.number);
	 set_var_value(agent, 'fare', fare_val);
     let params = formatted_parameters('fare', fare_val);
     return predict(agent, params);
  }

  
  function gender(agent) {
    let gender_val = JSON.stringify(parameters.gender);
	set_var_value(agent, 'gender', gender_val);
    let params = formatted_parameters('gender', gender_val);
    return predict(agent, params);
  }
  
  function setting_sibsp(agent) {
    let sibsp_val = parameters.number;
    if (!sibsp_val) {
      	agent.add(`I'm sorry. I'm not sure. How many siblings and spouse altogether you travelled with?`);
      	agent.setContext({'name': 'specify_sibsp', 'lifespan': 1});
    }
    else {
      	agent.add(`I understood you travelled with ${sibsp_val} siblings and spouse altogether`);
     	set_var_value(agent, 'sibsp', sibsp_val);
      	let params = formatted_parameters('sibsp', sibsp_val);
    	return predict(agent, params);
    }
  }

  function setting_parch(agent) {
    let parch_val = parameters.number;
    if (!parch_val) {
      	agent.add(`I'm sorry. I'm not sure. How many parents and children altogether you travelled with?`);
      	agent.setContext({'name': 'specify_parch', 'lifespan': 1});
    }
    else {
      	agent.add(`I understood you travelled with ${parch_val} parents and children altogether`);
     	set_var_value(agent, 'parch', parch_val);
      	let params = formatted_parameters('parch', parch_val);
    	return predict(agent, params);
    }
  }
  
  function specify_sibsp(agent) {
    let sibsp_val = parameters.number;
    set_var_value(agent, 'sibsp', sibsp_val);
    let params = formatted_parameters('sibsp', sibsp_val);
    return predict(agent, params);
  }
  
  function specify_parch(agent) {
	let parch_val = parameters.number;
    set_var_value(agent, 'parch', parch_val);
    let params = formatted_parameters('parch', parch_val);
    return predict(agent, params);
  }
  
  function travelling_alone(agent) {
    agent.add(`I understand you travelled alone. I'm setting sibsp and parch to zero.`);
    set_var_value(agent, 'parch', '0');
    set_var_value(agent, 'sibsp', '0');
    let params = formatted_parameters('parch', '0', 'sibsp', '0');
    return predict(agent, params);

  }

  
  
  function setting_embarked(agent) {
    let embarked_val = parameters.embarkment_place;
    console.log(embarked_val);
    if (!embarked_val) {
      	agent.add("Where have you embarked on the Titanic? Possible places were:");
     	["Belfast", "Cherbourg", "Queenstown", "Southampton"].forEach(place => agent.add(new Suggestion(place)));
    }
    else {
      	embarked_val = JSON.stringify(embarked_val);
     	set_var_value(agent, 'embarked', embarked_val); 
        let params = formatted_parameters('embarked', embarked_val);
    	return predict(agent, params);
    }
  }
  
  function setting_class(agent) {
   	let class_val = parameters.class;
    if (!class_val && request.body.queryResult.queryText == "passenger") {
      	["1st", "2nd", "3rd"].forEach(kind => agent.add(new Suggestion(kind)));
    }
    else if (!class_val && request.body.queryResult.queryText == "crew") {
      	["deck crew", "engineering crew", "restaurant staff", "victualling crew"].forEach(kind =>
                                            agent.add(new Suggestion(kind)));
    }
    else if (!class_val) {
      	agent.add("Were you travelling as a passenger or part of the crew?");
      	["passenger", "crew"].forEach(kind => agent.add(new Suggestion(kind)));
    }
    else {
      	class_val = JSON.stringify(class_val);
     	set_var_value(agent, 'class', class_val); 
        let params = formatted_parameters('class', class_val);
    	return predict(agent, params);
    }
  }


  function set_var_value(agent, variable, value) {
     let context_dict = {
       'name': storage_context,
       'lifespan': 100,
       'parameters': {
       }
     };
    context_dict.parameters[variable] = value;
     agent.setContext(context_dict);
  }

  
  function get_var_value(agent, variable) {
    let context = agent.getContext(storage_context);
    if (!context || !context.parameters[variable]) {
      return 'X';
    } 
    else {
      return context.parameters[variable]; 
    }
  }
  
  function current_knowledge(agent) {
    	let unknown = [];
    	all_variables.forEach(variable => {
          		let val = get_var_value(agent, variable);
          		if (!val || val == 'X') {
                 	agent.add(`Your ${pretty_vars[variable]} is not yet defined`);
                }
          		else {
                 	agent.add(`Your ${pretty_vars[variable]} is ${val}`); 
                }
        	}
          );
  }
  
  function survival_message(probability) {
   	if (probability < 0.4) {
     	return `I'm sorry. It looks like you would've died on Titanic. Your chance of survival equals ${probability}`;
    }
    else if (probability < 0.6) {
      	return `Your chance of survival equals ${probability}. It's close to a toss of a coin!`;
    }
    else {
    	return `Good news! You would've survived the disaster. Your chance of survival equals ${probability}`;
    }
  }
  
  function current_prediction(agent) {
    	let params = formatted_parameters();
    	return predict(agent, params);
  }
  
  function formatted_parameters(changed_variable=null, changed_value=null, changed_var2=null, changed_val2=null) {
	let params_str = ``;
    let params_dict = new Map();
    all_variables.forEach(variable => params_dict[variable] = get_var_value(agent, variable));
    if (changed_variable) { 
      params_dict[changed_variable] = changed_value;
    }
    if (changed_var2) {
      params_dict[changed_var2] = changed_val2; 
    }
    for (var key in params_dict) { 
    	params_str += key + `=` + params_dict[key] + `&`;
    }
    console.log(params_str);
    return params_str;
  }
  
  function ceteris_paribus(agent) {
     let variable = parameters.variable;
     if (!variable || variable.length === 0) 
     { 
       variable = 'age'; 
     }
     else {
       variable = variable[0]; 
     }
     let params = formatted_parameters();
     let imageUrl = `${server_address}/ceteris_paribus?${params}variable=${variable}`;
     console.log(imageUrl);
     
   	 agent.add(`Creating a plot. It may take a few seconds...`);
     agent.add(new Card({
       title: `Ceteris Paribus plot`,
        imageUrl: imageUrl,
        text: `This plot illustrates how the prediction changes when ${variable} is changed and everything else is fixed`,
    	})
  	);
  }
  
  function break_down(agent) {
     let params = formatted_parameters();
     let imageUrl = `${server_address}/break_down?${params}`;
     console.log(imageUrl);
     
   	 agent.add(`Creating a plot. It may take a few seconds...`);
     agent.add(new Card({
       title: `Break down plot`,
        imageUrl: imageUrl,
        text: `This chart illustrates the contribution of variables to the final prediction`,
    	})
  	);

  }

   function list_variables(agent) {
     let first = 4;
     if (request.body.queryResult.queryText == "More...") {
      	 all_variables.slice(first).forEach(variable => agent.add(new Suggestion(variable)));
     }
     else {
     	all_variables.slice(0, first).forEach(variable => agent.add(new Suggestion(variable)));
       	agent.add(new Suggestion('More...'));
     }
   }
  
  function welcome(agent) {
    agent.add(`Hello! I'm DrAnt, a Titanic survival bot. Let's see whether you would've survived on Titanic and discuss the model predictions.`);
	agent.add(`You can list variables, ask about their meanings and set values at any time.`);
    agent.add(`Do not limit yourself. Ask anything you'd like to know. I learn from interactions like this!`);
    agent.add(`Perhaps you want to start by filling up some values:`);
    list_variables(agent);
  }
  
  function restart(agent) {
	agent.setContext({'name': storage_context, 'lifespan': '0'});
    agent.add(`Let's start from the beginning!`);
  }
  
  function end_conversation(agent) {
   	agent.add('Great talking to you! Come back later, as I will improve!');
	all_variables.forEach(variable => set_var_value(agent, variable, 'X'));    
  }
  
  function help_needed(agent) {
    agent.add(`Below is the list of all variables you can set. Click on them for their description.`);
    list_variables(agent);
  }

  // Run the proper function handler based on the matched Dialogflow intent name
  let intentMap = new Map();
  intentMap.set('Default Welcome Intent', welcome);
  intentMap.set('Default Fallback Intent', fallback);
  
  intentMap.set('explain_feature', explain_feature);
  intentMap.set('list_variables', list_variables);
  intentMap.set('end_conversation', end_conversation);
  intentMap.set('restart', restart);
  intentMap.set('help_needed', help_needed);
  intentMap.set('current_knowledge', current_knowledge);
  intentMap.set('current_prediction', current_prediction);
  intentMap.set('specify_parch', specify_parch);
  intentMap.set('specify_sibsp', specify_sibsp);
  
  intentMap.set('telling_age', age);
  intentMap.set('telling_gender', gender);
  intentMap.set('setting_embarked', setting_embarked);
  intentMap.set('setting_class', setting_class);
  intentMap.set('setting_fare', setting_fare);
  intentMap.set('setting_sibsp', setting_sibsp);
  intentMap.set('setting_parch', setting_parch);
  intentMap.set('travelling_alone', travelling_alone);
  
  intentMap.set('ceteris_paribus', ceteris_paribus);
  intentMap.set('break_down', break_down);
  
  agent.handleRequest(intentMap);
});

