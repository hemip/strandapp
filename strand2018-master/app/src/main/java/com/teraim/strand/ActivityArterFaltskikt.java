package com.teraim.strand;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;

import android.R.color;
import android.app.Activity;
import android.graphics.Typeface;
import android.os.Bundle;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.View.OnClickListener;
import android.view.ViewGroup.LayoutParams;
import android.widget.AdapterView;
import android.widget.AdapterView.OnItemClickListener;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import com.teraim.strand.dataobjekt.ArtListaProvider;
import com.teraim.strand.dataobjekt.TableArter;
import com.teraim.strand.dataobjekt.TableBase;
import com.teraim.strand.dataobjekt.TableBuskar;
import com.teraim.strand.dataobjekt.TableTrees;
import com.teraim.strand.utils.Constants;

/**
 * 
 * @author Terje
 *
 */
public class ActivityArterFaltskikt extends M_Activity {


	private LinearLayout buttonPanel,contentPane;

	private ListView myList;

	private TextView initialText;

	private ArtListaProvider ap;

	private final String[] columnTags = new String[] {"Familj","Släkte","Svenskt namn"};
	private final int[] columnIds = new int[] {R.id.column1, R.id.column2, R.id.column3};
	private final static String[] alfabet = {
		"*","A","B","C","D","E","F",
		"G","H","I","J","K","L",
		"M","N","O","P","Q","R",
		"S","T","U","V","W","X",
		"Y","Z","Å","Ä","Ö"};

	//keeps currently selected char if any
	private String currCh = null;

	//The table being built
	private TableBase myTable;

	//convenience..
	private Provyta py = Strand.getCurrentProvyta(this);

	protected int state = ShowInitial;

	private int myProvider = -1;


	@Override
	protected void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);

		//If a state exist..
		if (savedInstanceState != null) {
			state = savedInstanceState.getInt(Constants.KEY_STATE);
			currCh = savedInstanceState.getString(Constants.KEY_CHAR);
			Log.d("Strand","My state is "+state);
		}

		setContentView(R.layout.activity_arter_faltskikt);

		//wrapper for tables to make them scrollable.
		scrollis = new ScrollView(this);
		//Get the Table.
		int table = getIntent().getIntExtra(Constants.KEY_CURRENT_TABLE, -1);
		switch (table) {
		case Constants.TRÄD:
			myTable = new TableTrees(this,py.getTräd());
			myProvider  = R.raw.strandinventering_arter_trad;
			Log.d("Strand","Table set to träd.");
			break;
		case Constants.BUSKAR:
			myTable = new TableBuskar(this,py.getBuskar());			
			myProvider = R.raw.strandinventering_arter_buskar;
			Log.d("Strand","Table set to buskar.");
			break;

		case Constants.GRAMINIDER:
			myTable = new TableArter(this,py.getArter());
			myProvider = R.raw.strandinventering_arter_graminider;
			Log.d("Strand","Table set to graminider.");
			break;
		case Constants.LAVAR:
			myTable = new TableArter(this,py.getArter());
			myProvider = R.raw.strandinventering_arter_lavar;
			Log.d("Strand","Table set to lavar.");
			break;
		case Constants.MOSSOR:
			myTable = new TableArter(this,py.getArter());
			myProvider = R.raw.strandinventering_arter_mossor;
			Log.d("Strand","Table set to mossor.");
			break;
		case Constants.ORTER:
			myTable = new TableArter(this,py.getArter());
			myProvider = R.raw.strandinventering_arter_orter;
			Log.d("Strand","Table set to örter.");
			break;
		case Constants.RIS:
			myTable = new TableArter(this,py.getArter());
			myProvider = R.raw.strandinventering_arter_ris;
			Log.d("Strand","Table set to ris.");
			break;
		case Constants.ORMBUNKAR:
			myTable = new TableArter(this,py.getArter());
			myProvider = R.raw.strandinventering_arter_ormbunkar;
			Log.d("Strand","Table set to ormbunkar.");
			break;
		default:
			Log.e("Strand","current table not set in ActivityArter..");
			break;
		}

		initialText = new TextView(this);
		initialText.setText("Välj arter till vänster! ");


		buttonPanel = (LinearLayout) this.findViewById(R.id.buttonPanel);
		contentPane = (LinearLayout) this.findViewById(R.id.contentPane);
		//Generate buttons..A-Ö.

		final OnClickListener cl = new OnClickListener(){

			@Override
			public void onClick(View v) {

				String ch = ((Button)v).getText().toString();
				Log.d("Strand","User pressed "+ch);
				//generate List selector for this character.
				//if equals current - do nothing.


				currCh = ch;


				//TableTrees tr = new TableTrees(ActivityArterFaltskikt.this);
				//TableArter ta = new TableArter(ActivityArterFaltskikt.this);


				myList = getList(currCh);
				state = ShowList;
				redraw();


			}




		};
		Button b;
		LayoutParams lp = new LayoutParams(LayoutParams.MATCH_PARENT,LayoutParams.WRAP_CONTENT);
		for (String c:alfabet) {
			b = new Button(this);
			b.setLayoutParams(lp);
			b.setText(c);
			b.setOnClickListener(cl);
			buttonPanel.addView(b);
		}

		//Create a provider if not existing & cache it.
		//Otherwise use cashed for less I/O
		ap = Strand.getArtListaProvider();
		if (ap != null && ap.getProvider()==myProvider)
			Log.e("Strand","Using cached artprovider");
		else {		
			ap = new ArtListaProvider(this,myProvider);
			Strand.setCurrentArtListaProvider(ap);
		}
		redraw();
	}

	private ListView getList(String ch) {

		ArrayList<HashMap<String, String>> mylistData = ap.getArter(ch);
		ListView list = new ListView(ActivityArterFaltskikt.this);
		ListView.LayoutParams lp = new ListView.LayoutParams(LayoutParams.WRAP_CONTENT,LayoutParams.WRAP_CONTENT);

		TableAdapter arrayAdapter =
				new TableAdapter(ActivityArterFaltskikt.this, mylistData, R.layout.list_row,
						columnTags , columnIds);
		list.setAdapter(arrayAdapter);

		list.setOnItemClickListener(new OnItemClickListener(){

			@Override
			public void onItemClick(AdapterView<?> parent, View view, int position,
					long id) {

				//Third column has the name.
				String name = ((TextView)view.findViewById(R.id.column3)).getText().toString();

				Toast.makeText(getBaseContext(), name, Toast.LENGTH_LONG).show();
				state = ShowTable;
				myTable.addRow(name);
				redraw();
			}
		}				
				);
		return list;


	}
	private View createTableHeader() {
		final int[] sortFlags = new int[] {ArtListaProvider.FAMILJ_F,ArtListaProvider.SLÄKTE_F,ArtListaProvider.SVENSK_F};
		final Map<Integer,Integer> sort = new HashMap<Integer,Integer>();
		LinearLayout header = (LinearLayout)LayoutInflater.from(getBaseContext()).inflate(R.layout.list_row,null);
		int count = 0;
		for (int id:columnIds) {
			TextView textview = (TextView) header.findViewById(id);
			sort.put(id,sortFlags[count]);
			assert(textview!=null);
			textview.setTypeface(Typeface.DEFAULT_BOLD);
			textview.setBackgroundColor(color.darker_gray);
			textview.setText(columnTags[count]);
			textview.setClickable(true);
			textview.setOnClickListener(new OnClickListener() {

				@Override
				public void onClick(View v) {
					//Change sort order & generate new list.
					ap.setSortColumn(sort.get(v.getId()));
					if (currCh!=null) {
						contentPane.removeView(myList);
						myList = getList(currCh);
						contentPane.addView(myList);
					}

				}});
			count++;
		}
		return header;
	}

	//State variables:
	private final static int ShowTable = 1;
	private final static int ShowList = 2;
	private final static int ShowInitial = 0;

	private ScrollView scrollis;

	private void redraw() {
		contentPane.removeAllViews();

		switch (state) {
		case ShowTable:	
			scrollis.removeAllViews();
			scrollis.addView(myTable);	        
			contentPane.addView(scrollis);		
			break;
		case ShowList:
			contentPane.addView(createPageHeader(currCh));
			contentPane.addView(createTableHeader());
			if (myList == null)
				myList = getList(currCh);
			contentPane.addView(myList);
			break;
		case ShowInitial:
			if (myTable!=null) {
				state = ShowTable;
				redraw();
			} 
			else
				contentPane.addView(initialText);
			break;

		}
	}

	private TextView createPageHeader(String ch) {
		TextView tv = (TextView)LayoutInflater.from(getBaseContext()).inflate(R.layout.header,null);
		tv.setText("Arter "+ch);
		return tv;
	}

	/* (non-Javadoc)
	 * @see android.app.Activity#onSaveInstanceState(android.os.Bundle)
	 */
	@Override
	protected void onSaveInstanceState(Bundle outState) {
		outState.putInt(Constants.KEY_STATE,state);
		outState.putString(Constants.KEY_CHAR,currCh);

		super.onSaveInstanceState(outState);
	}




}
