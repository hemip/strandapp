package com.teraim.strand;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.AdapterView;
import android.widget.AdapterView.OnItemSelectedListener;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import com.teraim.strand.Strand.PersistenceHelper;
import com.teraim.strand.dataobjekt.StrandInputData;
import com.teraim.strand.dataobjekt.StrandInputData.Entry;
import com.teraim.strand.exporter.ActivityExport;
import com.teraim.strand.utils.Constants;

/**
 * 
 * @author Terje
 *
 * This is the entry point class for the App.
 */
public class ActivityMain extends Activity {

	private PersistenceHelper ph;
	private String selectedRuta=PersistenceHelper.UNDEFINED;


	private LinearLayout exprDia;
	private EditText etLag;
	private EditText etInv;
	private Spinner rutSpinner;
	private Spinner ytSpinner;
	private Spinner alternativSpinner;
	private Context c;

	private Provyta py = null;
	private String pyID = null;

	private ArrayAdapter<String> provyteArrayAdapter;
	//Arraylist for provytor.
	private final List<String> provyteArray = new ArrayList<String>();
	private final static String påbörjad = "Status: Påbörjad";
	private final static String ny = "Status: Ny";
	private final static String klar = "Status: Markerad klar";

	private final static String[] altArray = {"Inventera","Avståndsinventera","Markera klar","Inventera ej"};


	@Override
	protected void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		setContentView(R.layout.activity_main);
		exprDia = (LinearLayout)this.findViewById(R.id.exprdia);
		c=this;
		ph = new PersistenceHelper(this);

		//Load the input data.
		//For now, load from resources.
		InputStream is = getResources().openRawResource(R.raw.data);
		assert(is !=null);
		//This call will parse the input file and create a singleton data object that can be used statically.
		StrandInputData.parseInputFile(is);

		//Create some spinners

		alternativSpinner = (Spinner)this.findViewById(R.id.alternativSpinner);

		rutSpinner = (Spinner)this.findViewById(R.id.rutaspinner);
		//There can be many entries with the same ID, but we want only one of each.
		Set<String>s=new HashSet<String>();
		List<Entry> es = StrandInputData.getEntries();
		for (Entry e:es) 
			s.add(e.getRuta());
		//Fill with the list of strings from the set. Sorting order not relevant.
		final List<String> rutArray = new ArrayList<String>(s);
		//..or maybe it is? Let's sort just for fun.
		java.util.Collections.sort(rutArray);
		//Use standard adapter.
		ArrayAdapter<String> rutArrayAdapter = new ArrayAdapter<String>(this, android.R.layout.simple_spinner_dropdown_item, rutArray);
		rutSpinner.setAdapter(rutArrayAdapter);

		ArrayAdapter<String> altArrayAdapter = new ArrayAdapter<String>(this, android.R.layout.simple_spinner_dropdown_item, altArray);
		alternativSpinner.setAdapter(altArrayAdapter);

		ytSpinner = (Spinner)this.findViewById(R.id.provytaspinner); 	
		//Then, create an adaptor and link to the array.
		provyteArrayAdapter = new ArrayAdapter<String>(this, android.R.layout.simple_spinner_dropdown_item, provyteArray);
		ytSpinner.setAdapter(provyteArrayAdapter);

		//Create a listener for event when ruta is selected.
		//If new ruta, re-generate the list of available provytor.	 
		rutSpinner.setOnItemSelectedListener(new OnItemSelectedListener() {

			@Override
			public void onItemSelected(AdapterView<?> parentView, View selectedItemView, int position, long id) {
				selectedRuta = rutArray.get(position);
				refreshProvyteSpinner(selectedRuta);
				Log.d("Strand","Rutspinner onitemselected");
				provyteArrayAdapter.notifyDataSetChanged();	
			}

			@Override
			public void onNothingSelected(AdapterView<?> parentView) {
				// your code here
			}

		});

		//Check if a provyta has been selected.
		ytSpinner.setOnItemSelectedListener(new OnItemSelectedListener() {
			@Override
			public void onItemSelected(AdapterView<?> parentView, View selectedItemView, int position, long id) {
				String selectedProvyta = provyteArray.get(position);
				if (position!=0) {
					Log.d("Strand","ytspinner onselected, pos: "+position+" sr: "+selectedRuta+" sp"+selectedProvyta);
					showProvyteStatus(selectedRuta,selectedProvyta);
				}
				else {
					exprDia.setVisibility(View.INVISIBLE);
				}
			}


			@Override
			public void onNothingSelected(AdapterView<?> parentView) {
				// Gör inget
			}

		});

		etLag = (EditText)this.findViewById(R.id.edit_lagnr);
		etInv = (EditText)this.findViewById(R.id.edit_invent);

		//check if there is a current provvyta being worked on.

		py = Strand.getCurrentProvyta(this);

		if (py!=null) {
			Log.d("Strand","loaded current provyta with py"+py.getProvyta());
			etLag.setText(py.getLagnummer());
			etInv.setText(py.getInventerare());
			setSpinner(rutSpinner,py.getRuta());

		}
		else {
			rutArray.add(0,"-");
			provyteArray.clear();
			provyteArray.add(0, "-");
			provyteArrayAdapter.notifyDataSetChanged();	
			rutArrayAdapter.notifyDataSetChanged();		 
		}
		((Button)findViewById(R.id.MainPageExportButton)).setOnClickListener(new View.OnClickListener() {
			@Override
			public void onClick(View v) {
				boolean showError = true;

				try {
					int lagnummer = Integer.parseInt(etLag.getText().toString());
					if(lagnummer>=10 && lagnummer<=100){
						showError = false;
						Intent intent = new Intent(c, ActivityExport.class);
						intent.putExtra("lagnummer",lagnummer);
						startActivity(intent);
					}
				}
				catch (NumberFormatException e){
				}


				if(showError){
					Toast toast = Toast.makeText(c, "Fyll i ett korrekt lagnummer!", Toast.LENGTH_LONG);
					toast.show();
				}
			}
		});



	}
	private void showProvyteStatus(String selectedRuta, String selectedProvyta) {
		TextView expressionMark = (TextView)this.findViewById(R.id.expressionMark);
		TextView exprMessage = (TextView)this.findViewById(R.id.exprMessage);
		//		Button startB =(Button)this.findViewById(R.id.startB);
		TextView pyIDt = (TextView)this.findViewById(R.id.pyID);

		//check if user selected other py than currently selected.
		if (py!=null) {
			//if so, trigger search for selected.
			if (!selectedRuta.equals(py.getRuta())||!selectedProvyta.equals(py.getProvyta())) {
				Log.d("Strand","selected ruta/provyta does not match py");
				Log.d("Strand","selectedRuta: "+selectedRuta+" selectedProvyta: "+selectedProvyta+" py.ruta: "+py.getRuta()+" py.py "+py.getProvyta());
				py=null;
			}
		}
		//if new provyta selected, do something cool.
		if (py==null) {
			List<Entry> es = StrandInputData.getEntries();	    				
			for(Entry e:es) {
				if (e.getRuta().equals(selectedRuta) &&
						e.getProvyta().equals(selectedProvyta)) {
					pyID = e.getPyid();
					//We now have the  PyID. Fetch the object (if any) from persistent storage.		        		
					py = Persistent.onLoad(pyID);
					break;
				}
			}
		} else
			pyID = py.getpyID();
		pyIDt.setText("Provytans ID: "+pyID);
		exprDia.setVisibility(View.VISIBLE);
		//If object already exist, offer Edit button. Else, offer Create


		if (py !=null) {
			String metod = (py.getInventeringstyp()!=null)?"  ("+py.getInventeringstyp()+")":"";
				
			if(py.isLocked()) {
				expressionMark.setTextColor(Color.RED);
				expressionMark.setText("!");
				exprMessage.setText(klar+metod);

			}
			else {
				expressionMark.setTextColor(Color.BLUE);       				
				expressionMark.setText("!");
				exprMessage.setText(påbörjad+metod);
			}
			
		} else {
			expressionMark.setTextColor(Color.GREEN);
			expressionMark.setText("\u2713");
			exprMessage.setText(ny);     				    			
		}
	}



	@Override
	protected void onResume() {
		super.onResume();
		//check if user made changes..refresh..
		Log.d("Strand","on resume..");
		if(py!=null) {
			showProvyteStatus(py.getRuta(),py.getProvyta());			
		}

	}

	//Called when button pressed to start insamling.
	public void startCollect(final View view) {
		int selected = alternativSpinner.getSelectedItemPosition();
		switch(selected) {
		case 0:
		case 1:
			if (py!=null) {
				if (py.isLocked()) {
					DialogInterface.OnClickListener dialogClickListener = new DialogInterface.OnClickListener() {
						@Override
						public void onClick(DialogInterface dialog, int which) {
							switch (which){
							case DialogInterface.BUTTON_POSITIVE:
								py.setLocked(false);
								begin();
								break;

							case DialogInterface.BUTTON_NEGATIVE:
								break;
							}
						}
					};

					AlertDialog.Builder builder = new AlertDialog.Builder(this);
					builder.setTitle("Ytan är markerad som klar!")
					.setMessage("Vill du verkligen ändra värden?").setPositiveButton("Ja", dialogClickListener)
					.setNegativeButton("Nej", dialogClickListener).show();

				} else if (!py.isNormal()) {
					createNew(selected);
					begin();				}				
				else {
					py.setInventeringstyp((selected == 0)?"normal":"distans");
					begin();
				}

			} 	else {
				assert(pyID != null);
				createNew(selected);
				begin();
			}

			break;


		case 2:
			//Markera klar.
			if (py!=null) {
				if(!py.isLocked()) {
					py.setLocked(true);
					begin();
				}
			} else {
				AlertDialog.Builder builder = new AlertDialog.Builder(this);
				builder.setMessage("Fel. En yta utan inmatningar kan inte markeras klar. Kanske vill du välja 'inventeras ej' istället?")
				.setCancelable(false)
				.setPositiveButton("Jag förstår", new DialogInterface.OnClickListener() {
					public void onClick(DialogInterface dialog, int id) {		                
					}
				});
				AlertDialog alert = builder.create();
				alert.show();
			}
			break;
			//Inventeras ej.
		case 3:
			if (py!=null) {
				if (py.isNormal()) {
					DialogInterface.OnClickListener dialogClickListener = new DialogInterface.OnClickListener() {
						@Override
						public void onClick(DialogInterface dialog, int which) {
							switch (which){
							case DialogInterface.BUTTON_POSITIVE:
								createNewTom();
								begin();
								break;
							case DialogInterface.BUTTON_NEGATIVE:
								break;
							}
						}
					};

					AlertDialog.Builder builder = new AlertDialog.Builder(this);
					builder.setTitle("En normal yta har redan påbörjats!")
					.setMessage("Om du går vidare med 'inventeras ej' så försvinner tidigare inmatningar").setPositiveButton("Jag förstår", dialogClickListener)
					.setNegativeButton("Avbryt", dialogClickListener).show();	
				} else
					begin();
				
			} else {
				createNewTom();
				begin();

			}
			break;
		}
		

	}
	private void createNewTom() {
		py = new Provyta(pyID,false);
		Log.d("Strand","createNewTOM, typ "+py.isNormal());
		py.setLagnummer(etLag.getText().toString());
		py.setRuta((String)rutSpinner.getSelectedItem());
		py.setProvyta( (String)ytSpinner.getSelectedItem());
		py.setInventerare( etInv.getText().toString());
		py.setInventeringstyp("ej inventerad");
	}
	
	
	private void createNew(int selected) {
		py = new Provyta(pyID);	 
		py.setInventeringstyp((selected == 0)?"normal":"distans");
		//save globals into the new provyta.
		py.setLagnummer(etLag.getText().toString());
		Log.d("Strand","Lagnummer set to "+etLag.getText().toString());
		py.setRuta((String)rutSpinner.getSelectedItem());
		py.setProvyta( (String)ytSpinner.getSelectedItem());
		py.setInventerare( etInv.getText().toString());
	}
	
	private void begin() {

		//Save all values for default when starting up next time..
		ph.put(Constants.KEY_CURRENT_PY,py.getpyID());
		Log.d("Strand","Saved provyta: "+ (String)ytSpinner.getSelectedItem());
		//Buffer the py object.
		Strand.setCurrentProvyta(py);
		Intent intent;
		//If only lock, restart current activity. 
		//Otherwise go to next
		if (py.isLocked()) {
			finish();
			intent = getIntent();			
		} else if (py.isNormal())
			intent = new Intent(this, ActivityTakePicture.class);
		else 
			intent = new Intent(this, ActivityNoInput.class);
		
		startActivity(intent);

	}


	private void setSpinner(Spinner mySpinner, String selected) {
		ArrayAdapter<String> myAdap = (ArrayAdapter<String>)mySpinner.getAdapter(); //cast to an ArrayAdapter
		int spinnerPosition = myAdap.getPosition(selected);
		//set the default according to value
		Log.d("Strand","setspinner called with "+selected+" position of selected is "+spinnerPosition);
		mySpinner.setSelection(spinnerPosition);
	}

	private void refreshProvyteSpinner(String selectedRuta) {
		//fill spinner		
		List<Entry> es = StrandInputData.getEntries();
		provyteArray.clear();
		//Add all ytor for selected
		for (Entry e:es) 
			if(e.getRuta().equals(selectedRuta)) {
				provyteArray.add(e.getProvyta());
			}
		provyteArray.add(0,"-");
		if (py!=null) {
			setSpinner(ytSpinner,py.getProvyta());
		} else
			ytSpinner.setSelection(0);
	}



}
