package com.teraim.strand.dataobjekt;

import java.io.Serializable;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.Set;

import android.util.Log;

import com.teraim.strand.Provyta;

public class Table implements Serializable {


	private static final long serialVersionUID = 660162787850970002L;

	private int noOfCols;
	private Map<String,String[]> rowlist;
	private int myID = 0;
	private Provyta mama;

	public Table(int noOfCols, Provyta mother) {
		this.noOfCols = noOfCols;
		rowlist = new LinkedHashMap<String,String[]>();
		mama = mother;
	}


	public void saveRow (String id, String ... entries)
	{

		if (entries.length == noOfCols) {
			rowlist.put(id, entries);
			Log.d("Strand","Added row of data to table with id"+ id+" and name "+entries[0]);
			mama.setSaved(false);
		}
		else
			Log.e("Strand","Wrong number of columns ("+entries.length+"). Expected "+noOfCols);

	}
	
	public void saveRow(String id, List<String> ets) {
		if (ets.size()==noOfCols) {
			String[] array = new String[ets.size()];
			ets.toArray(array);
			rowlist.put(id, array);
			mama.setSaved(false);			
		}
	}

	public Set<Entry<String, String[]>> getTable() {
		return rowlist.entrySet();
	}


	public void deleteRow(String id) {
		String[] r = rowlist.remove(id);
		if (r!=null)
			Log.d("Strand","Removed row");
		else
			Log.e("Strand","Ups...couldnt find row in RemoveRow");
	}


	public String getNextId() {
		return Integer.toString(myID++);
	}


	public int getRowCount() {
		return rowlist.size();
	}

	public String[] getRow(String key) {
		return rowlist.get(key);
	}

	public String getLastKey() {
		Set<String> set = rowlist.keySet();
		String[] array = set.toArray(new String[0]);
		int length = array.length;
		String lastkey=null;
		if (length>0)
			lastkey = array[length-1];
		Log.d("Strand", "I believe the last key was "+lastkey);
		return lastkey;
	}


	public void clear() {
		rowlist.clear();
	}






}
