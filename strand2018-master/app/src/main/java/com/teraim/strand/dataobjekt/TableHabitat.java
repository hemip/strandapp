package com.teraim.strand.dataobjekt;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map.Entry;
import java.util.Set;

import android.content.Context;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TableRow;
import android.widget.TextView;

import com.teraim.strand.ActivityHabitat;
import com.teraim.strand.R;
import com.teraim.strand.Strand;
import com.teraim.strand.dataobjekt.InputAlertBuilder.AlertBuildHelper;
import com.teraim.strand.utils.ArrayHelper;
import com.teraim.strand.utils.FormsHelper;

public class TableHabitat extends TableBase {


	int[] textviews = {R.id.kod,R.id.namn, R.id.utbredning, R.id.start,R.id.slut}; //för en rad
	int[] editviews = {R.id.habitaId,R.id.habitatNamn,R.id.habitatUtbredning,R.id.habiataStart,R.id.habiataSlut}; // för popup.

	protected final static int[] columnIds = new int[] {R.id.kod,R.id.namn, R.id.utbredning, R.id.start,R.id.slut,R.id.kriterie}; //för rad
	protected final static String[] columnName = new String[] {"Kod","Namn","M.K.","Start (m)","Slut (m)","Kriterie"};


	public final static String[] noEntries = {"Bebyggd strand","Påverkad av gräv/pirbygge/muddring",
			"Avverkning kraftig utglesning av träd","Hydrologi påverkad (ex. reglering)",
			"Området exploaterat eller bebyggt","Ej naturlig skog","Naturlig skog, men ålderskriterie ej uppfyllt"};
	private final static String[] procent = {"Ej aktuellt","<10%","10-30%",">30%"};
	private final static String[] grovDodVed = {"Ej aktuellt","< 10m³/ha",">10m³/ha"};
	private final static String[] skogSuccessionOptions = {"Ej aktuellt","Enbart busk-/lövbård","Busk-, löv- och barrskog"};
	private final static String[] betesregimOptions = {"Ej aktuellt","Ingen betespåverkan","Tamdjur","Vilda djur/fåglar"};
	private final static String[] betestryckOptions = {"Ej aktuellt","Ingen betestryck","Lågt betestryck (>30% av ytan)","Medel (30-70% ytan)", "Välbetat (<70% ytan)"};
	List<String> values = new ArrayList<String>(Arrays.asList("13","14","15","16","17","18","19"));


	//	private boolean hasListener = true;

	private TableRow dynHabitatRow =null;
	private String dynHabitatId;
	private Spinner sp_9999 ;
	private ArrayAdapter<String> altArrayAdapter;
	private ArrayAdapter<String> busktackningAdapter, krontackningAdapter, grovDodVedAdapter, skogSuccessionAdapter, betesregimAdapter, betestryckAdapter;

	public TableHabitat(Context c, Table data) {
		super(c,data);
		redraw(R.layout.row_habitat_table,columnIds,columnName);

		altArrayAdapter = new ArrayAdapter<String>(getContext(), android.R.layout.simple_spinner_dropdown_item, noEntries);
		busktackningAdapter = new ArrayAdapter<String>(getContext(), android.R.layout.simple_spinner_dropdown_item, procent);
		krontackningAdapter = new ArrayAdapter<String>(getContext(), android.R.layout.simple_spinner_dropdown_item, procent);
		grovDodVedAdapter = new ArrayAdapter<String>(getContext(), android.R.layout.simple_spinner_dropdown_item, grovDodVed);
		skogSuccessionAdapter = new ArrayAdapter<String>(getContext(), android.R.layout.simple_spinner_dropdown_item, skogSuccessionOptions);
		betesregimAdapter = new ArrayAdapter<String>(getContext(), android.R.layout.simple_spinner_dropdown_item, betesregimOptions);
		betestryckAdapter = new ArrayAdapter<String>(getContext(), android.R.layout.simple_spinner_dropdown_item, betestryckOptions);
	}



	@Override
	public void addRow(String name) {
		//not used.
	}


	//Has listener field indicates in reality DynHabitat.
	public TableRow addRow(String kod, String name, String utbredning, String start) {
		String[] entries = new String[6];
		entries[0]=kod;
		//The special case..
		entries[1]=name;
		entries[2]=utbredning;
		entries[3]=start;
		entries[4]="";
		//Kriterie...
		entries[5]="";
		String myID = myData.getNextId();
		TableRow row = addRow(myID,entries);
		row.performClick();
		myData.saveRow(myID, kod,name,utbredning,start,"","");
		return row;
	}




	@Override
	protected TableRow addRow(final String myID, final String[] entries) {

		//checkfirst if this is special case.



		if (entries[0].equals(ActivityHabitat.KOD_DYNHABITAT)) {
			final TableRow row = addDynHabitatRow(myID, entries);
			return row;
		} else {
			final TableRow row = createRow(R.layout.row_habitat_table);
			assert(row!=null);
			//Load
			int i=0;

			for(int id:columnIds)
				((TextView)row.findViewById(id)).setText(entries[i++]);

			row.setTag(myID);
			row.setOnClickListener(createHabitatDialog(row, myID, entries));
			row.setOnLongClickListener(onHabitatLongClick(row));

			addView(row);
			return row;
		}
	}


	public void recalculateDistances() {
		Set<Entry<String, String[]>> t = myData.getTable();
		float prevSlut = 0;
		for(Entry<String, String[]>e:t) {
			String[] val = e.getValue();
			if (val!=null) {
				String slut = val[ActivityHabitat.SLUT_KOLUMN_NO];
				String start = val[ActivityHabitat.START_KOLUMN_NO];
				float sluti = Strand.getFloat(slut);
				float starti = Strand.getFloat(start);
				if (prevSlut!=starti){
					//Shift if wrong
					Log.d("Strand","Found row where SlutPrev != Startcurrent: "+prevSlut+" "+starti);
					float dif = sluti-starti;
					//if start bigger than slut, try using old prevslut.
					if (dif<0) {
						starti = prevSlut;
						dif = sluti - starti;
					}
					Log.d("Strand","Diff: "+dif+" sluti: "+sluti);
					starti = prevSlut;
					sluti = prevSlut+dif;
					Log.d("Strand","New  start "+starti+" newslut "+sluti);
					if (starti>sluti) {
						Log.d("Strand","Start i was bigger than sluti...");
						continue;
					}
					val[ActivityHabitat.SLUT_KOLUMN_NO]=Float.toString(sluti);
					val[ActivityHabitat.START_KOLUMN_NO]=Float.toString(starti);

				}
				prevSlut = sluti;
			} else
				Log.e("Strand","Oops...found null entry in myData table in recalcDistance");

		}

		redraw(R.layout.row_habitat_table,columnIds,columnName);
		//this.invalidate();
	}



	public TableRow getDynHabitatRow() {
		return dynHabitatRow;
	}

	public void removeDynHabitatRow() {
		Log.d("Strand","User removed dynRow");
		dynHabitatRow=null;
		dynHabitatId = null;
	}

	//Case first time
	public TableRow addDynHabitatRow(String[] entries) {
		final TableRow row = addDynHabitatRow(myData.getNextId(),entries);

		row.performClick();

		return row;
	}


	public void setDynHabLen(String length) {
		String slut = getDynHabSlut();
		float s = Strand.getFloat(slut);
		float l = Strand.getFloat(length);
		setDynHabSlut(String.valueOf(s+l));
	}
	//Dynhablength is the sum of all lengths in the dynTable.
	public void setDynHabSlut(String newSum) {
		final TextView slut = ((TextView)dynHabitatRow.findViewById(R.id.slut));
		slut.setText(newSum);
		String[] row = myData.getRow(dynHabitatId);
		row[ActivityHabitat.SLUT_KOLUMN_NO] = newSum;
	}

	//Dynhablength is the sum of all lengths in the dynTable.
	public String getDynHabSlut() {
		Log.d("Strand","Checking dynhabitatrow with id "+dynHabitatId);

		String[] row = myData.getRow(dynHabitatId);
		if (row!=null)
			return row[ActivityHabitat.SLUT_KOLUMN_NO];
		else
			return "oops";
	}


	//Case  rebuild of table.
	public TableRow addDynHabitatRow(String myID, String[] entries) {
		//refuse to add if already exist
		final TableRow row = createRow(R.layout.row_habitat_table);
		int i=0;
		for(int id:columnIds)
			((TextView)row.findViewById(id)).setText(entries[i++]);
		row.setTag(myID);

		dynHabitatRow = row;
		dynHabitatId = myID;
		addView(row);

		myData.saveRow(myID, entries);

		row.setOnClickListener(createHabitatDialog(row, myID, entries));
		Log.d("Strand","Added dynhabitatrow. dynRowId set to "+myID);
		return row;
	}

	private OnLongClickListener onHabitatLongClick(final TableRow row) {
		return new OnLongClickListener() {
			@Override
			public boolean onLongClick(View arg0) {
				Log.d("Strand","This gets fired");
				removeRow(row);
				//need to also subtract the distance from all other rows.
				recalculateDistances();

				return true;
			}};
	}

	private OnClickListener createHabitatDialog(final TableRow row, final String myID, final String[] entries) {
		return InputAlertBuilder.createAlert(-1, "Habitat",null,
				new AlertBuildHelper(TableHabitat.this.getContext()){

					@Override
					public View createView() {
						boolean is9999Habitat = entries[0].equals(ActivityHabitat.KOD_9999);
						boolean isDynHabitat = entries[0].equals(ActivityHabitat.KOD_DYNHABITAT);

						ScrollView inputView = (ScrollView)LayoutInflater.from(c).inflate(R.layout.habitat_table_popup,null);
						Spinner busktackningSpinner = (Spinner)inputView.findViewById(R.id.habitatBusktackning);
						Spinner krontackningSpinner = (Spinner)inputView.findViewById(R.id.habitatKrontackning);
						Spinner grovDodVedSpinner = (Spinner)inputView.findViewById(R.id.habitatDodved);
						Spinner skogSuccessionSpinner = (Spinner)inputView.findViewById(R.id.habitatSkogSuccession);
						Spinner betesregimSpinner = (Spinner)inputView.findViewById(R.id.habitatBetesregim);
						Spinner betestryckSpinner = (Spinner)inputView.findViewById(R.id.habitatBetestryck);
						CheckBox fagelskrammaCheckBox = (CheckBox)inputView.findViewById(R.id.habitatFagelskramma);
						CheckBox habitatSiktrojningCheckBox = (CheckBox)inputView.findViewById(R.id.habitatSiktrojning);
						String[] myEntries = myData.getRow(myID);

						String[] localEntries = myEntries != null ? myEntries : entries;


						int i = 0;
						for(int id:textviews) {
							((EditText) inputView.findViewById(editviews[i++])).setText(((TextView) row.findViewById(id)).getText());
						}

						if (isDynHabitat) {
							inputView.findViewById(R.id.habiataStart).setEnabled(false);
							inputView.findViewById(R.id.habiataSlut).setEnabled(false);
						}

						if(is9999Habitat) {
							sp_9999 = (Spinner)inputView.findViewById(R.id.habiat9999anledningSpinner);
							sp_9999.setAdapter(altArrayAdapter);
							FormsHelper.SetSpinnerSelection(sp_9999, noEntries, localEntries[5]);

							Log.d("Strand","no 5 was "+sp_9999.getSelectedItem().toString());
						}
						else{
							((LinearLayout)inputView.findViewById(R.id.habiat9999anledningLayout)).setVisibility(GONE);
						}

						// Fågelskrämma inom 50 m
						String fagelskramma = ArrayHelper.GetValueOrDefault(localEntries, 6, "false");
						if (fagelskramma.equals("true"))
							fagelskrammaCheckBox.setChecked(true);

						// Siktröjning av busk-/träd
						String siktrojning = ArrayHelper.GetValueOrDefault(localEntries, 7, "false");
						if (siktrojning.equals("true"))
							habitatSiktrojningCheckBox.setChecked(true);

						// Busktäckning
						busktackningSpinner.setAdapter(busktackningAdapter);
						String currentBusktackning = ArrayHelper.GetValueOrDefault(localEntries, 8, "");
						FormsHelper.SetSpinnerSelection(busktackningSpinner, procent, currentBusktackning);

						// Krontäckning
						krontackningSpinner.setAdapter(krontackningAdapter);
						String currentKrontackning = ArrayHelper.GetValueOrDefault(localEntries, 9, "");
						FormsHelper.SetSpinnerSelection(krontackningSpinner, procent, currentKrontackning);

						// Skog: grov död ved
						grovDodVedSpinner.setAdapter(grovDodVedAdapter);
						String currentgrovDodVed = ArrayHelper.GetValueOrDefault(localEntries, 10, "");
						FormsHelper.SetSpinnerSelection(grovDodVedSpinner, grovDodVed, currentgrovDodVed);

						// Skog: succession
						skogSuccessionSpinner.setAdapter(skogSuccessionAdapter);
						String currentSkogSuccession = ArrayHelper.GetValueOrDefault(localEntries, 11, "");
						FormsHelper.SetSpinnerSelection(skogSuccessionSpinner, skogSuccessionOptions, currentSkogSuccession);

						// Betesregim 0,1ha
						betesregimSpinner.setAdapter(betesregimAdapter);
						String currentBetesregim = ArrayHelper.GetValueOrDefault(localEntries, 12, "");
						FormsHelper.SetSpinnerSelection(betesregimSpinner, betesregimOptions, currentBetesregim);

						// Betestryck 0,1ha
						betestryckSpinner.setAdapter(betestryckAdapter);
						String currentBetestryck = ArrayHelper.GetValueOrDefault(localEntries, 13, "");
						FormsHelper.SetSpinnerSelection(betestryckSpinner, betestryckOptions, currentBetestryck);

									/*if (localEntries != null && localEntries.length > 6 && localEntries[6] != null && !localEntries[6].isEmpty()) {
										int busktackningIndex = Arrays.asList(procent).indexOf(localEntries[6]);
										if (busktackningIndex > -1) {
											busktackningSpinner.setSelection(busktackningIndex, true);
										}
									}*/

						return inputView;
					}

					@Override
					public void setResult(int resultId, View inputView,
										  View outputView) {
						Log.d("Strand","Nu ska jag minsann spara!");
						List<String> ets = new ArrayList<String>();
						for(int id:editviews)
							ets.add(((EditText)inputView.findViewById(id)).getText().toString());

						int i = 0;
						//Add spinner if any.
						if (entries[0].equals(ActivityHabitat.KOD_9999))
							ets.add((String) sp_9999.getSelectedItem());
						else
							ets.add("");

						for(int id:columnIds)  {
							((TextView) row.findViewById(id)).setText(ets.get(i));
							Log.d("Strand", "Sätter värde " + ets.get(i));
							i++;
						}

						ets.add(((CheckBox)inputView.findViewById(R.id.habitatFagelskramma)).isChecked() ? "true" : "false");
						ets.add(((CheckBox)inputView.findViewById(R.id.habitatSiktrojning)).isChecked() ? "true" : "false");
						ets.add(((Spinner)inputView.findViewById(R.id.habitatBusktackning)).getSelectedItem().toString());
						ets.add(((Spinner)inputView.findViewById(R.id.habitatKrontackning)).getSelectedItem().toString());
						ets.add(((Spinner)inputView.findViewById(R.id.habitatDodved)).getSelectedItem().toString());
						ets.add(((Spinner)inputView.findViewById(R.id.habitatSkogSuccession)).getSelectedItem().toString());
						ets.add(((Spinner)inputView.findViewById(R.id.habitatBetesregim)).getSelectedItem().toString());
						ets.add(((Spinner)inputView.findViewById(R.id.habitatBetestryck)).getSelectedItem().toString());

						myData.saveRow(myID, ets);

					}}, row);
	}




}
